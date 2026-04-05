import { parseSync, Visitor } from "oxc-parser";

export interface ParsedImport {
  source: string;
  kind: "runtime" | "type" | "asset";
  specifiers: string[];
  line: number;
}

export interface ParsedDynamicImport {
  source: string | null;
  line: number;
}

export interface ParsedSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type_alias" | "variable" | "enum" | "component";
  exported: boolean;
  deprecated: boolean;
  line: number;
  column: number;
  loc: number;
}

export interface ParsedReExport {
  source: string;
  specifiers: string[];
  isWildcard: boolean;
  line: number;
}

export interface JsxUsage {
  componentName: string;
  line: number;
}

export interface ParsedFile {
  imports: ParsedImport[];
  dynamicImports: ParsedDynamicImport[];
  symbols: ParsedSymbol[];
  reExports: ParsedReExport[];
  jsxUsages: JsxUsage[];
  errors: string[];
}

const ASSET_EXTENSIONS = [".css", ".scss", ".less", ".svg", ".png", ".jpg", ".json", ".graphql"];

function isAssetImport(source: string): boolean {
  return ASSET_EXTENSIONS.some((ext) => source.endsWith(ext));
}

function getLineNumber(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === "\n") line++;
  }
  return line;
}

function countLinesInSpan(code: string, start: number, end: number): number {
  let count = 1;
  for (let i = start; i < end && i < code.length; i++) {
    if (code[i] === "\n") count++;
  }
  return count;
}

export function parseFile(filename: string, code: string): ParsedFile {
  const result: ParsedFile = {
    imports: [],
    dynamicImports: [],
    symbols: [],
    reExports: [],
    jsxUsages: [],
    errors: [],
  };

  let parsed;
  try {
    parsed = parseSync(filename, code, { sourceType: "module" });
  } catch (e) {
    result.errors.push(String(e));
    return result;
  }

  if (parsed.errors.length > 0) {
    result.errors = parsed.errors.map((e: any) => typeof e === "string" ? e : e.message ?? String(e));
    if (!parsed.program) return result;
  }

  // Build set of exported names from module.staticExports
  const exportedNames = new Set<string>();
  const mod = parsed.module;
  if (mod) {
    for (const exp of mod.staticExports ?? []) {
      for (const entry of exp.entries ?? []) {
        if (entry.localName?.name) {
          exportedNames.add(entry.localName.name);
        }
        if (entry.exportName?.kind === "Default") {
          exportedNames.add("default");
        }
      }
    }

    // Extract static imports
    for (const imp of mod.staticImports ?? []) {
      const source = imp.moduleRequest?.value;
      if (!source) continue;

      const hasEntries = (imp.entries ?? []).length > 0;
      const isType = hasEntries && imp.entries.every((e: any) => e.isType);
      const kind = isAssetImport(source)
        ? "asset" as const
        : isType
          ? "type" as const
          : "runtime" as const;

      const specifiers = (imp.entries ?? []).map(
        (e: any) => e.localName?.value ?? e.importName?.name ?? "*"
      );

      result.imports.push({
        source,
        kind,
        specifiers,
        line: getLineNumber(code, imp.start ?? 0),
      });
    }

    // Extract dynamic imports from module info
    for (const di of mod.dynamicImports ?? []) {
      const source = di.moduleRequest?.value
        ?? (di.moduleRequest ? code.substring(di.moduleRequest.start, di.moduleRequest.end).replace(/['"]/g, "") : null);
      result.dynamicImports.push({
        source,
        line: getLineNumber(code, di.start ?? 0),
      });
    }

    // Extract re-exports from staticExports that have moduleRequest
    for (const exp of mod.staticExports ?? []) {
      for (const entry of exp.entries ?? []) {
        if (entry.moduleRequest?.value) {
          const isWildcard = entry.importName?.kind === "AllButDefault" || entry.importName?.kind === "All";
          const specName = entry.exportName?.name ?? "*";
          // Group re-exports by source
          const existing = result.reExports.find(
            (r) => r.source === entry.moduleRequest.value && r.line === getLineNumber(code, exp.start ?? 0)
          );
          if (existing) {
            if (!isWildcard) existing.specifiers.push(specName);
            if (isWildcard) existing.isWildcard = true;
          } else {
            result.reExports.push({
              source: entry.moduleRequest.value,
              specifiers: isWildcard ? ["*"] : [specName],
              isWildcard,
              line: getLineNumber(code, exp.start ?? 0),
            });
          }
        }
      }
    }
  }

  // Walk AST for symbols and JSX
  const visitor = new Visitor({
    FunctionDeclaration(node: any) {
      if (node.id?.name) {
        const commentRegion = code.substring(Math.max(0, (node.start ?? 0) - 300), node.start ?? 0);
        result.symbols.push({
          name: node.id.name,
          kind: "function",
          exported: exportedNames.has(node.id.name),
          deprecated: /@deprecated/.test(commentRegion),
          line: getLineNumber(code, node.start ?? 0),
          column: 0,
          loc: countLinesInSpan(code, node.start ?? 0, node.end ?? 0),
        });
      }
    },
    ClassDeclaration(node: any) {
      if (node.id?.name) {
        const commentRegion = code.substring(Math.max(0, (node.start ?? 0) - 300), node.start ?? 0);
        result.symbols.push({
          name: node.id.name,
          kind: "class",
          exported: exportedNames.has(node.id.name),
          deprecated: /@deprecated/.test(commentRegion),
          line: getLineNumber(code, node.start ?? 0),
          column: 0,
          loc: countLinesInSpan(code, node.start ?? 0, node.end ?? 0),
        });
      }
    },
    TSInterfaceDeclaration(node: any) {
      if (node.id?.name) {
        result.symbols.push({
          name: node.id.name,
          kind: "interface",
          exported: exportedNames.has(node.id.name),
          deprecated: false,
          line: getLineNumber(code, node.start ?? 0),
          column: 0,
          loc: countLinesInSpan(code, node.start ?? 0, node.end ?? 0),
        });
      }
    },
    TSTypeAliasDeclaration(node: any) {
      if (node.id?.name) {
        result.symbols.push({
          name: node.id.name,
          kind: "type_alias",
          exported: exportedNames.has(node.id.name),
          deprecated: false,
          line: getLineNumber(code, node.start ?? 0),
          column: 0,
          loc: countLinesInSpan(code, node.start ?? 0, node.end ?? 0),
        });
      }
    },
    TSEnumDeclaration(node: any) {
      if (node.id?.name) {
        result.symbols.push({
          name: node.id.name,
          kind: "enum",
          exported: exportedNames.has(node.id.name),
          deprecated: false,
          line: getLineNumber(code, node.start ?? 0),
          column: 0,
          loc: countLinesInSpan(code, node.start ?? 0, node.end ?? 0),
        });
      }
    },
    JSXOpeningElement(node: any) {
      const name = node.name?.name ?? node.name?.object?.name;
      if (name && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
        result.jsxUsages.push({
          componentName: name,
          line: getLineNumber(code, node.start ?? 0),
        });
      }
    },
  });

  visitor.visit(parsed.program);

  return result;
}
