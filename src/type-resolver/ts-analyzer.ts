import ts from "typescript";
import { existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { logger } from "../logger.js";
import type {
  TypeAnalyzer,
  CallGraphResult,
  SymbolResolution,
  TypeInfo,
  HierarchyResult,
  BreakingChange,
} from "../types.js";

/**
 * TypeScript Language Service-based type analyzer.
 * Provides semantic analysis: type resolution, call graphs, hierarchy, references.
 */
export class TsAnalyzer implements TypeAnalyzer {
  private service: ts.LanguageService | null = null;
  private files = new Map<string, { version: number; content: string }>();
  private compilerOptions: ts.CompilerOptions = {};
  private repoRoot: string = "";

  async init(tsconfigPath: string): Promise<void> {
    this.repoRoot = dirname(resolve(tsconfigPath));
    const fullPath = resolve(tsconfigPath);

    if (existsSync(fullPath)) {
      const configFile = ts.readConfigFile(fullPath, (path) => readFileSync(path, "utf-8"));
      if (!configFile.error) {
        const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, this.repoRoot);
        this.compilerOptions = parsed.options;

        // Load initial files from tsconfig
        for (const file of parsed.fileNames) {
          this.addFile(file);
        }
      }
    }

    if (!this.compilerOptions.target) {
      this.compilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        allowJs: true,
      };
    }

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => this.compilerOptions,
      getScriptFileNames: () => [...this.files.keys()],
      getScriptVersion: (fileName) => String(this.files.get(fileName)?.version ?? 0),
      getScriptSnapshot: (fileName) => {
        const entry = this.files.get(fileName);
        if (entry) return ts.ScriptSnapshot.fromString(entry.content);
        // Try reading from disk for lib files
        try {
          const content = readFileSync(fileName, "utf-8");
          return ts.ScriptSnapshot.fromString(content);
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => this.repoRoot,
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      readFile: (path) => {
        try { return readFileSync(path, "utf-8"); } catch { return undefined; }
      },
      fileExists: (path) => existsSync(path),
    };

    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    logger.info("TsAnalyzer initialized", { files: this.files.size, repoRoot: this.repoRoot });
  }

  async dispose(): Promise<void> {
    if (this.service) {
      this.service.dispose();
      this.service = null;
    }
    this.files.clear();
  }

  isInitialized(): boolean {
    return this.service !== null;
  }

  /** Add or update a file in the language service */
  addFile(filePath: string): void {
    const fullPath = resolve(filePath);
    try {
      const content = readFileSync(fullPath, "utf-8");
      const existing = this.files.get(fullPath);
      this.files.set(fullPath, {
        version: (existing?.version ?? 0) + 1,
        content,
      });
    } catch {
      // File doesn't exist or can't be read
    }
  }

  /** Resolve a file path relative to repo root */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith("/")) return filePath;
    return join(this.repoRoot, filePath);
  }

  /** Find the position of a symbol name in a file */
  private findSymbolPosition(filePath: string, symbolName: string): number | null {
    const fullPath = this.resolvePath(filePath);
    const entry = this.files.get(fullPath);
    if (!entry) return null;

    // Search for symbol declaration patterns
    const patterns = [
      new RegExp(`(?:function|const|let|var|class|interface|type|enum)\\s+${escapeRegex(symbolName)}\\b`),
      new RegExp(`\\b${escapeRegex(symbolName)}\\s*[=(]`),
    ];

    for (const pattern of patterns) {
      const match = entry.content.match(pattern);
      if (match && match.index !== undefined) {
        // Return position of the symbol name itself
        const nameStart = entry.content.indexOf(symbolName, match.index);
        return nameStart >= 0 ? nameStart : match.index;
      }
    }
    return null;
  }

  async getCallGraph(
    symbol: string,
    direction: "callers" | "callees" | "both",
    depth: number,
  ): Promise<CallGraphResult> {
    if (!this.service) throw new Error("TsAnalyzer not initialized");

    const edges: CallGraphResult["edges"] = [];
    const [filePath, symbolName] = parseSymbolId(symbol);
    const fullPath = this.resolvePath(filePath);
    const pos = this.findSymbolPosition(filePath, symbolName);

    if (pos === null) return { root: symbol, edges };

    if (direction === "callers" || direction === "both") {
      const refs = this.service.findReferences(fullPath, pos);
      if (refs) {
        for (const refSymbol of refs) {
          for (const ref of refSymbol.references) {
            if (ref.isDefinition) continue;
            const relPath = ref.fileName.startsWith(this.repoRoot)
              ? ref.fileName.slice(this.repoRoot.length + 1)
              : ref.fileName;
            const line = this.getLineFromPos(ref.fileName, ref.textSpan.start);
            edges.push({ caller: relPath, callee: symbol, line });
          }
        }
      }
    }

    if (direction === "callees" || direction === "both") {
      // For callees, we need to find references within the function body
      const entry = this.files.get(fullPath);
      if (entry && pos !== null) {
        const info = this.service.getQuickInfoAtPosition(fullPath, pos);
        if (info) {
          // Get definitions this symbol calls — scan the function for identifiers
          const defs = this.service.getDefinitionAtPosition(fullPath, pos);
          if (defs) {
            for (const def of defs) {
              const relPath = def.fileName.startsWith(this.repoRoot)
                ? def.fileName.slice(this.repoRoot.length + 1)
                : def.fileName;
              edges.push({
                caller: symbol,
                callee: `${relPath}::${def.name}`,
                line: this.getLineFromPos(def.fileName, def.textSpan.start),
              });
            }
          }
        }
      }
    }

    return { root: symbol, edges };
  }

  async resolveSymbol(name: string, fileContext?: string): Promise<SymbolResolution> {
    if (!this.service) throw new Error("TsAnalyzer not initialized");

    const result: SymbolResolution = {
      name,
      filePath: "",
      line: 0,
      column: 0,
      typeSignature: "",
      references: [],
    };

    // If we have file context, look there first
    const searchFile = fileContext ? this.resolvePath(fileContext) : null;
    let pos: number | null = null;

    if (searchFile && fileContext) {
      pos = this.findSymbolPosition(fileContext, name);
      if (pos !== null) {
        const defs = this.service.getDefinitionAtPosition(searchFile, pos);
        if (defs && defs.length > 0) {
          const def = defs[0];
          result.filePath = def.fileName.startsWith(this.repoRoot)
            ? def.fileName.slice(this.repoRoot.length + 1)
            : def.fileName;
          result.line = this.getLineFromPos(def.fileName, def.textSpan.start);
        }

        const info = this.service.getQuickInfoAtPosition(searchFile, pos);
        if (info) {
          result.typeSignature = ts.displayPartsToString(info.displayParts);
        }

        // Find all references
        const refs = this.service.findReferences(searchFile, pos);
        if (refs) {
          for (const refSymbol of refs) {
            for (const ref of refSymbol.references) {
              const relPath = ref.fileName.startsWith(this.repoRoot)
                ? ref.fileName.slice(this.repoRoot.length + 1)
                : ref.fileName;
              result.references.push({
                filePath: relPath,
                line: this.getLineFromPos(ref.fileName, ref.textSpan.start),
              });
            }
          }
        }
      }
    }

    return result;
  }

  async getTypeInfo(nodeId: string): Promise<TypeInfo> {
    if (!this.service) throw new Error("TsAnalyzer not initialized");

    const [filePath, symbolName] = parseSymbolId(nodeId);
    const fullPath = this.resolvePath(filePath);
    const pos = this.findSymbolPosition(filePath, symbolName);

    const result: TypeInfo = {
      typeString: "unknown",
      isAny: false,
      isGeneric: false,
      parameters: [],
    };

    if (pos === null) return result;

    const info = this.service.getQuickInfoAtPosition(fullPath, pos);
    if (info) {
      result.typeString = ts.displayPartsToString(info.displayParts);
      result.isAny = result.typeString.includes(": any") || result.typeString === "any";
      result.isGeneric = result.typeString.includes("<");

      // Extract parameters from signature
      const sigMatch = result.typeString.match(/\(([^)]*)\)/);
      if (sigMatch) {
        const params = sigMatch[1].split(",").filter(Boolean);
        result.parameters = params.map((p) => {
          const parts = p.trim().split(/:\s*/);
          return { name: parts[0]?.trim() ?? "", type: parts[1]?.trim() ?? "any" };
        });
      }

      // Extract return type
      const retMatch = result.typeString.match(/\):\s*(.+)$/);
      if (retMatch) {
        result.returnType = retMatch[1].trim();
      }
    }

    return result;
  }

  async isAnyType(nodeId: string): Promise<boolean> {
    const info = await this.getTypeInfo(nodeId);
    return info.isAny;
  }

  async getHierarchy(symbol: string): Promise<HierarchyResult> {
    if (!this.service) throw new Error("TsAnalyzer not initialized");

    const [filePath, symbolName] = parseSymbolId(symbol);
    const fullPath = this.resolvePath(filePath);
    const pos = this.findSymbolPosition(filePath, symbolName);

    const result: HierarchyResult = {
      symbol,
      extends: [],
      implements: [],
      extendedBy: [],
      implementedBy: [],
    };

    if (pos === null) return result;

    // Use the source file AST to find heritage clauses
    const program = this.service.getProgram();
    if (!program) return result;

    const sourceFile = program.getSourceFile(fullPath);
    if (!sourceFile) return result;

    // Walk the AST to find the class/interface declaration
    ts.forEachChild(sourceFile, function visit(node) {
      if (ts.isClassDeclaration(node) && node.name?.text === symbolName) {
        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            const list = clause.token === ts.SyntaxKind.ExtendsKeyword ? result.extends : result.implements;
            for (const type of clause.types) {
              list.push(type.expression.getText(sourceFile));
            }
          }
        }
      }
      if (ts.isInterfaceDeclaration(node) && node.name?.text === symbolName) {
        if (node.heritageClauses) {
          for (const clause of node.heritageClauses) {
            for (const type of clause.types) {
              result.extends.push(type.expression.getText(sourceFile));
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    });

    // Find classes that extend/implement this symbol via references
    const implLocations = this.service.getImplementationAtPosition(fullPath, pos);
    if (implLocations) {
      for (const impl of implLocations) {
        const relPath = impl.fileName.startsWith(this.repoRoot)
          ? impl.fileName.slice(this.repoRoot.length + 1)
          : impl.fileName;
        const implSource = program.getSourceFile(impl.fileName);
        if (implSource) {
          ts.forEachChild(implSource, function visit(node) {
            if (ts.isClassDeclaration(node) && node.heritageClauses) {
              for (const clause of node.heritageClauses) {
                for (const type of clause.types) {
                  if (type.expression.getText(implSource) === symbolName) {
                    const name = node.name?.text ?? "anonymous";
                    if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                      result.extendedBy.push(`${relPath}::${name}`);
                    } else {
                      result.implementedBy.push(`${relPath}::${name}`);
                    }
                  }
                }
              }
            }
            ts.forEachChild(node, visit);
          });
        }
      }
    }

    return result;
  }

  async getBreakingChanges(_oldRef: string, _newRef: string): Promise<BreakingChange[]> {
    // Breaking change detection requires comparing two versions of the codebase
    // This is a placeholder — full implementation needs git checkout + diff
    logger.warn("getBreakingChanges not yet implemented (requires git ref comparison)");
    return [];
  }

  private getLineFromPos(fileName: string, pos: number): number {
    const entry = this.files.get(fileName);
    if (!entry) return 0;
    const text = entry.content.substring(0, pos);
    return text.split("\n").length;
  }
}

/** Parse "src/file.ts::symbolName" into [filePath, symbolName] */
function parseSymbolId(id: string): [string, string] {
  const parts = id.split("::");
  if (parts.length >= 2) return [parts[0], parts.slice(1).join("::")];
  return [id, ""];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
