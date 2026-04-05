import { Glob } from "bun";
import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { parseFile, type ParsedFile } from "../parser/oxc-parser.js";
import { GraphStore } from "./graph-store.js";

export interface BuildOptions {
  include: string[];
  exclude: string[];
  maxFileSize: number;
}

export interface BuildResult {
  store: GraphStore;
  filesParsed: number;
  errors: Array<{ file: string; error: string }>;
  timeMs: number;
}

export class GraphBuilder {
  private repoRoot: string;
  private options: BuildOptions;

  constructor(repoRoot: string, options: BuildOptions) {
    this.repoRoot = repoRoot;
    this.options = options;
  }

  async build(existingStore?: GraphStore): Promise<BuildResult> {
    const start = performance.now();
    const store = existingStore ?? new GraphStore();
    const errors: Array<{ file: string; error: string }> = [];
    let filesParsed = 0;

    // Collect files
    const files: string[] = [];
    try {
      for (const pattern of this.options.include) {
        const glob = new Glob(pattern);
        for await (const match of glob.scan({ cwd: this.repoRoot, absolute: false })) {
          if (this.shouldExclude(match)) continue;
          if (!files.includes(match)) files.push(match);
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable
      return { store, filesParsed: 0, errors, timeMs: performance.now() - start };
    }

    // Parse each file
    const parsedFiles = new Map<string, ParsedFile>();
    for (const filePath of files) {
      const absPath = join(this.repoRoot, filePath);
      let code: string;
      try {
        code = readFileSync(absPath, "utf-8");
      } catch {
        errors.push({ file: filePath, error: "Could not read file" });
        continue;
      }

      if (code.length > this.options.maxFileSize) {
        store.addFileNode(filePath, { loc: code.split("\n").length });
        filesParsed++;
        continue;
      }

      const parsed = parseFile(filePath, code);
      if (parsed.errors.length > 0 && parsed.symbols.length === 0) {
        errors.push({ file: filePath, error: parsed.errors.join("; ") });
      }

      parsedFiles.set(filePath, parsed);
      filesParsed++;

      // Add file node
      store.addFileNode(filePath, { loc: code.split("\n").length });

      // Add symbol nodes
      for (const sym of parsed.symbols) {
        const id = `${filePath}::${sym.name}`;
        store.addSymbolNode(id, {
          kind: sym.kind,
          name: sym.name,
          filePath,
          line: sym.line,
          column: sym.column,
          exported: sym.exported,
          deprecated: sym.deprecated,
          hasAnyType: false,
          loc: sym.loc,
          contentHash: "",
        });
      }
    }

    // Build edges
    for (const [filePath, parsed] of parsedFiles) {
      for (const imp of parsed.imports) {
        const resolvedTarget = this.resolveImport(imp.source, filePath, files);
        if (resolvedTarget) {
          const kind = imp.kind === "type" ? "type_import" as const
            : imp.kind === "asset" ? "asset_import" as const
            : "runtime_import" as const;
          store.addEdge(filePath, resolvedTarget, kind);
        }
      }

      for (const di of parsed.dynamicImports) {
        if (di.source) {
          const resolvedTarget = this.resolveImport(di.source, filePath, files);
          if (resolvedTarget) {
            store.addEdge(filePath, resolvedTarget, "dynamic_import");
          }
        }
      }

      for (const reExp of parsed.reExports) {
        const resolvedTarget = this.resolveImport(reExp.source, filePath, files);
        if (resolvedTarget) {
          store.addEdge(filePath, resolvedTarget, "re_export");
        }
      }

      for (const jsx of parsed.jsxUsages) {
        for (const [otherFile, otherParsed] of parsedFiles) {
          const match = otherParsed.symbols.find(
            (s) => s.name === jsx.componentName && (s.kind === "function" || s.kind === "component")
          );
          if (match) {
            store.addEdge(filePath, `${otherFile}::${match.name}`, "jsx_renders");
            break;
          }
        }
      }
    }

    return { store, filesParsed, errors, timeMs: performance.now() - start };
  }

  private resolveImport(source: string, fromFile: string, knownFiles: string[]): string | null {
    if (!source.startsWith(".")) return null;

    const fromDir = dirname(fromFile);
    const rawResolved = resolve("/", fromDir, source).slice(1); // normalize without repoRoot prefix

    const candidates = [
      rawResolved,
      rawResolved + ".ts",
      rawResolved + ".tsx",
      rawResolved + "/index.ts",
      rawResolved + "/index.tsx",
    ];

    for (const candidate of candidates) {
      if (knownFiles.includes(candidate)) return candidate;
    }

    return null;
  }

  private shouldExclude(filePath: string): boolean {
    return this.options.exclude.some((pattern) => {
      if (pattern.includes("*")) {
        return new Glob(pattern).match(filePath);
      }
      return filePath.includes(pattern);
    });
  }
}
