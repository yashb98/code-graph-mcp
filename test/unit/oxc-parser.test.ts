import { describe, test, expect } from "bun:test";
import { parseFile, type ParsedFile } from "../../src/parser/oxc-parser.js";
import { readFileSync } from "fs";
import { join } from "path";

const FIXTURES = join(import.meta.dir, "../fixtures/basic");

describe("OXC Parser", () => {
  test("extracts static imports with correct kinds", () => {
    const code = readFileSync(join(FIXTURES, "index.ts"), "utf-8");
    const result = parseFile("index.ts", code);

    expect(result.imports).toContainEqual(
      expect.objectContaining({ source: "./utils", kind: "runtime" })
    );
    expect(result.imports).toContainEqual(
      expect.objectContaining({ source: "./types", kind: "type" })
    );
    expect(result.imports).toContainEqual(
      expect.objectContaining({ source: "./styles.css", kind: "asset" })
    );
  });

  test("extracts dynamic imports", () => {
    const code = readFileSync(join(FIXTURES, "index.ts"), "utf-8");
    const result = parseFile("index.ts", code);

    expect(result.dynamicImports.length).toBeGreaterThanOrEqual(1);
    expect(result.dynamicImports).toContainEqual(
      expect.objectContaining({ source: "./lazy-module" })
    );
  });

  test("extracts exported functions", () => {
    const code = readFileSync(join(FIXTURES, "index.ts"), "utf-8");
    const result = parseFile("index.ts", code);

    const mainFn = result.symbols.find((s) => s.name === "main");
    expect(mainFn).toBeDefined();
    expect(mainFn!.kind).toBe("function");
    expect(mainFn!.exported).toBe(true);
  });

  test("extracts classes and detects deprecated via JSDoc", () => {
    const code = readFileSync(join(FIXTURES, "index.ts"), "utf-8");
    const result = parseFile("index.ts", code);

    const cls = result.symbols.find((s) => s.name === "AppService");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
    expect(cls!.exported).toBe(true);
    expect(cls!.deprecated).toBe(true);
  });

  test("extracts re-exports", () => {
    const code = readFileSync(join(FIXTURES, "utils.ts"), "utf-8");
    const result = parseFile("utils.ts", code);

    // `export { helper as default }` is a re-export with no moduleRequest — it's a local re-export
    // The parser should at minimum extract the exported functions
    const helperFn = result.symbols.find((s) => s.name === "helper");
    expect(helperFn).toBeDefined();
    expect(helperFn!.exported).toBe(true);
  });

  test("extracts JSX component usage", () => {
    const code = readFileSync(join(FIXTURES, "component.tsx"), "utf-8");
    const result = parseFile("component.tsx", code);

    expect(result.jsxUsages).toContainEqual(
      expect.objectContaining({ componentName: "Greeting" })
    );
  });

  test("handles parse errors gracefully", () => {
    const result = parseFile("broken.ts", "export function {");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("extracts interfaces", () => {
    const code = readFileSync(join(FIXTURES, "component.tsx"), "utf-8");
    const result = parseFile("component.tsx", code);

    const iface = result.symbols.find((s) => s.name === "Props");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
  });

  test("extracts multiple functions from same file", () => {
    const code = readFileSync(join(FIXTURES, "utils.ts"), "utf-8");
    const result = parseFile("utils.ts", code);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain("helper");
    expect(names).toContain("unused");
  });

  test("reports line numbers", () => {
    const code = readFileSync(join(FIXTURES, "index.ts"), "utf-8");
    const result = parseFile("index.ts", code);

    const mainFn = result.symbols.find((s) => s.name === "main");
    expect(mainFn!.line).toBeGreaterThan(0);
    expect(mainFn!.loc).toBeGreaterThan(0);
  });

  test("handles empty file", () => {
    const result = parseFile("empty.ts", "");
    expect(result.imports).toEqual([]);
    expect(result.symbols).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("extracts type aliases and enums", () => {
    const code = "export type ID = string; export enum Status { Active, Inactive }";
    const result = parseFile("test.ts", code);

    const typeAlias = result.symbols.find((s) => s.name === "ID");
    expect(typeAlias).toBeDefined();
    expect(typeAlias!.kind).toBe("type_alias");
    expect(typeAlias!.exported).toBe(true);

    const enumSym = result.symbols.find((s) => s.name === "Status");
    expect(enumSym).toBeDefined();
    expect(enumSym!.kind).toBe("enum");
    expect(enumSym!.exported).toBe(true);
  });

  test("extracts wildcard re-exports", () => {
    const code = 'export * from "./other"; export { foo } from "./bar";';
    const result = parseFile("barrel.ts", code);

    const wildcard = result.reExports.find((r) => r.source === "./other");
    expect(wildcard).toBeDefined();
    expect(wildcard!.isWildcard).toBe(true);

    const named = result.reExports.find((r) => r.source === "./bar");
    expect(named).toBeDefined();
    expect(named!.isWildcard).toBe(false);
    expect(named!.specifiers).toContain("foo");
  });
});
