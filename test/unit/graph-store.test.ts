import { describe, test, expect, beforeEach } from "bun:test";
import { GraphStore } from "../../src/graph/graph-store.js";

describe("GraphStore", () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
  });

  test("adds file nodes", () => {
    store.addFileNode("src/index.ts", { loc: 100 });
    const node = store.getNode("src/index.ts");
    expect(node).toBeDefined();
    expect(node!.kind).toBe("file");
    expect(node!.loc).toBe(100);
  });

  test("adds symbol nodes", () => {
    store.addSymbolNode("src/index.ts::main", {
      kind: "function",
      name: "main",
      filePath: "src/index.ts",
      line: 5,
      column: 0,
      exported: true,
      deprecated: false,
      hasAnyType: false,
      loc: 10,
      contentHash: "abc123",
    });
    expect(store.getNode("src/index.ts::main")).toBeDefined();
    expect(store.getNode("src/index.ts::main")!.kind).toBe("function");
  });

  test("adds edges between existing nodes", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");
    expect(store.hasEdge("src/a.ts", "src/b.ts")).toBe(true);
  });

  test("ignores edges with missing nodes", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addEdge("src/a.ts", "src/nonexistent.ts", "runtime_import");
    expect(store.edgeCount).toBe(0);
  });

  test("queries dependents (reverse deps)", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addFileNode("src/c.ts", { loc: 30 });
    store.addEdge("src/b.ts", "src/a.ts", "runtime_import");
    store.addEdge("src/c.ts", "src/a.ts", "runtime_import");

    const dependents = store.getDependents("src/a.ts");
    expect(dependents).toContain("src/b.ts");
    expect(dependents).toContain("src/c.ts");
  });

  test("queries dependencies (forward deps)", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");

    const deps = store.getDependencies("src/a.ts");
    expect(deps).toContain("src/b.ts");
  });

  test("removes all nodes/edges for a file", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addSymbolNode("src/a.ts::foo", {
      kind: "function", name: "foo", filePath: "src/a.ts",
      line: 1, column: 0, exported: true, deprecated: false,
      hasAnyType: false, loc: 5, contentHash: "x",
    });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");

    store.removeFile("src/a.ts");
    expect(store.getNode("src/a.ts")).toBeUndefined();
    expect(store.getNode("src/a.ts::foo")).toBeUndefined();
    expect(store.nodeCount).toBe(1);
  });

  test("gets orphan files (no incoming edges)", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addFileNode("src/c.ts", { loc: 30 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");

    const orphans = store.getOrphanFiles(new Set());
    expect(orphans).toContain("src/a.ts");
    expect(orphans).toContain("src/c.ts");
    expect(orphans).not.toContain("src/b.ts");
  });

  test("excludes entry points from orphans", () => {
    store.addFileNode("src/index.ts", { loc: 10 });
    store.addFileNode("src/unused.ts", { loc: 20 });

    const orphans = store.getOrphanFiles(new Set(["src/index.ts"]));
    expect(orphans).not.toContain("src/index.ts");
    expect(orphans).toContain("src/unused.ts");
  });

  test("returns correct stats", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addSymbolNode("src/a.ts::foo", {
      kind: "function", name: "foo", filePath: "src/a.ts",
      line: 1, column: 0, exported: true, deprecated: false,
      hasAnyType: false, loc: 5, contentHash: "",
    });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");

    const stats = store.getStats();
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(1);
    expect(stats.fileCount).toBe(2);
    expect(stats.symbolCount).toBe(1);
  });

  test("merges attributes on duplicate node add", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/a.ts", { loc: 50 });
    expect(store.getNode("src/a.ts")!.loc).toBe(50);
    expect(store.nodeCount).toBe(1);
  });

  test("getFileNodes returns only file nodes", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addSymbolNode("src/a.ts::foo", {
      kind: "function", name: "foo", filePath: "src/a.ts",
      line: 1, column: 0, exported: true, deprecated: false,
      hasAnyType: false, loc: 5, contentHash: "",
    });

    const files = store.getFileNodes();
    expect(files).toEqual(["src/a.ts"]);
  });

  test("clear removes everything", () => {
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");
    store.clear();
    expect(store.nodeCount).toBe(0);
    expect(store.edgeCount).toBe(0);
  });

  test("returns empty arrays for unknown nodes", () => {
    expect(store.getDependencies("nonexistent")).toEqual([]);
    expect(store.getDependents("nonexistent")).toEqual([]);
    expect(store.getNode("nonexistent")).toBeUndefined();
  });
});
