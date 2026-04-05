import { describe, test, expect, beforeEach } from "bun:test";
import { SemanticIndex } from "../../src/search/semantic.js";
import { GraphStore } from "../../src/graph/graph-store.js";

describe("SemanticIndex", () => {
  let index: SemanticIndex;
  let store: GraphStore;

  beforeEach(() => {
    index = new SemanticIndex();
    store = new GraphStore();

    store.addFileNode("src/auth/login.ts", { loc: 50 });
    store.addSymbolNode("src/auth/login.ts::authenticateUser", {
      kind: "function", name: "authenticateUser", filePath: "src/auth/login.ts",
      line: 1, column: 0, exported: true, deprecated: false, hasAnyType: false, loc: 10, contentHash: "",
    });
    store.addSymbolNode("src/auth/login.ts::validateToken", {
      kind: "function", name: "validateToken", filePath: "src/auth/login.ts",
      line: 15, column: 0, exported: true, deprecated: false, hasAnyType: false, loc: 8, contentHash: "",
    });

    store.addFileNode("src/services/user-service.ts", { loc: 30 });
    store.addSymbolNode("src/services/user-service.ts::UserService", {
      kind: "class", name: "UserService", filePath: "src/services/user-service.ts",
      line: 1, column: 0, exported: true, deprecated: false, hasAnyType: false, loc: 20, contentHash: "",
    });
    store.addSymbolNode("src/services/user-service.ts::getUser", {
      kind: "function", name: "getUser", filePath: "src/services/user-service.ts",
      line: 5, column: 0, exported: false, deprecated: false, hasAnyType: false, loc: 5, contentHash: "",
    });

    store.addFileNode("src/utils/logger.ts", { loc: 10 });
    store.addSymbolNode("src/utils/logger.ts::Logger", {
      kind: "class", name: "Logger", filePath: "src/utils/logger.ts",
      line: 1, column: 0, exported: true, deprecated: false, hasAnyType: false, loc: 10, contentHash: "",
    });
  });

  test("is not ready before init", () => {
    expect(index.isReady()).toBe(false);
  });

  test("textSearch finds exact name match", () => {
    const results = index.textSearch(store, "authenticateUser");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("authenticateUser");
    expect(results[0].score).toBe(1.0);
  });

  test("textSearch finds partial name match", () => {
    const results = index.textSearch(store, "User");
    expect(results.length).toBeGreaterThan(0);
    const names = results.map((r) => r.name);
    expect(names).toContain("UserService");
    expect(names).toContain("getUser");
  });

  test("textSearch finds by file path", () => {
    const results = index.textSearch(store, "auth");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.filePath.includes("auth"))).toBe(true);
  });

  test("textSearch returns empty for no match", () => {
    const results = index.textSearch(store, "zzznomatch");
    expect(results.length).toBe(0);
  });

  test("textSearch respects topK", () => {
    const results = index.textSearch(store, "e", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("textSearch results are sorted by score descending", () => {
    const results = index.textSearch(store, "User");
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  test("textSearch only returns symbols, not files", () => {
    const results = index.textSearch(store, "login");
    for (const r of results) {
      expect(r.kind).not.toBe("file");
    }
  });

  test("clear resets index", () => {
    index.clear();
    expect(index.size).toBe(0);
  });

  test("search throws if not initialized", async () => {
    expect(index.search("test")).rejects.toThrow("not initialized");
  });

  test("indexGraph throws if not initialized", async () => {
    expect(index.indexGraph(store)).rejects.toThrow("not initialized");
  });
});
