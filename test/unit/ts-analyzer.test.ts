import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { TsAnalyzer } from "../../src/type-resolver/ts-analyzer.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/typed-project");
const TSCONFIG = join(FIXTURE_ROOT, "tsconfig.json");

describe("TsAnalyzer", () => {
  let analyzer: TsAnalyzer;

  beforeAll(async () => {
    analyzer = new TsAnalyzer();
    await analyzer.init(TSCONFIG);
  });

  afterAll(async () => {
    await analyzer.dispose();
  });

  test("initializes from tsconfig", () => {
    expect(analyzer.isInitialized()).toBe(true);
  });

  test("getTypeInfo returns type for function", async () => {
    const info = await analyzer.getTypeInfo("src/base.ts::createId");
    expect(info.typeString).toContain("createId");
    expect(info.isAny).toBe(false);
  });

  test("getTypeInfo returns type for class", async () => {
    const info = await analyzer.getTypeInfo("src/user.ts::User");
    expect(info.typeString).toContain("User");
  });

  test("resolveSymbol finds definition", async () => {
    const result = await analyzer.resolveSymbol("User", "src/user.ts");
    expect(result.name).toBe("User");
    // Should find the class definition
    expect(result.typeSignature).toContain("User");
  });

  test("resolveSymbol finds references", async () => {
    const result = await analyzer.resolveSymbol("findUser", "src/user.ts");
    expect(result.references.length).toBeGreaterThan(0);
  });

  test("getCallGraph finds callers", async () => {
    const result = await analyzer.getCallGraph("src/base.ts::createId", "callers", 1);
    expect(result.root).toBe("src/base.ts::createId");
    // createId is called from user.ts
    expect(result.edges.length).toBeGreaterThan(0);
  });

  test("getHierarchy finds extends/implements", async () => {
    const result = await analyzer.getHierarchy("src/base.ts::BaseModel");
    expect(result.symbol).toBe("src/base.ts::BaseModel");
    expect(result.implements).toContain("Serializable");
  });

  test("getHierarchy finds class extending BaseModel", async () => {
    const result = await analyzer.getHierarchy("src/user.ts::User");
    expect(result.extends).toContain("BaseModel");
  });

  test("isAnyType returns false for typed symbols", async () => {
    const result = await analyzer.isAnyType("src/base.ts::createId");
    expect(result).toBe(false);
  });

  test("dispose cleans up", async () => {
    const temp = new TsAnalyzer();
    await temp.init(TSCONFIG);
    expect(temp.isInitialized()).toBe(true);
    await temp.dispose();
    expect(temp.isInitialized()).toBe(false);
  });

  test("extractExportedSignatures returns exported symbols", () => {
    const fullPath = join(FIXTURE_ROOT, "src/base.ts");
    const sigs = analyzer.extractExportedSignatures(fullPath);
    expect(sigs.has("BaseModel")).toBe(true);
    expect(sigs.has("Serializable")).toBe(true);
    expect(sigs.has("createId")).toBe(true);
  });

  test("getBreakingChanges detects no changes when comparing same file", async () => {
    const changes = await analyzer.getBreakingChanges("src/base.ts", "src/base.ts");
    expect(changes.length).toBe(0);
  });

  test("getCallGraph handles nonexistent symbol", async () => {
    const result = await analyzer.getCallGraph("src/base.ts::nonexistent", "callers", 1);
    expect(result.edges.length).toBe(0);
  });

  test("getTypeInfo handles nonexistent symbol", async () => {
    const result = await analyzer.getTypeInfo("src/base.ts::nonexistent");
    expect(result.typeString).toBe("unknown");
  });

  test("resolveSymbol without file context", async () => {
    const result = await analyzer.resolveSymbol("SomeSymbol");
    expect(result.name).toBe("SomeSymbol");
    expect(result.references.length).toBe(0);
  });
});
