import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { GraphStore } from "../../src/graph/graph-store.js";
import { KuzuPersistence } from "../../src/graph/persistence.js";
import { join } from "path";
import { rmSync, existsSync } from "fs";

const TEST_DB_PATH = join(import.meta.dir, "../.tmp-kuzu-test");

describe("KuzuPersistence", () => {
  let persistence: KuzuPersistence;

  beforeEach(async () => {
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
    persistence = new KuzuPersistence(TEST_DB_PATH);
    await persistence.init();
  });

  afterEach(async () => {
    // Don't call close() — segfaults on Bun. Let GC handle it.
    rmSync(TEST_DB_PATH, { recursive: true, force: true });
  });

  test("save and load round-trips nodes", async () => {
    const store = new GraphStore();
    store.addFileNode("src/a.ts", { loc: 50, contentHash: "abc123" });
    store.addFileNode("src/b.ts", { loc: 30 });
    store.addSymbolNode("src/a.ts::main", {
      kind: "function", name: "main", filePath: "src/a.ts",
      line: 5, column: 0, exported: true, deprecated: false,
      hasAnyType: false, loc: 10, contentHash: "def456",
    });

    const saved = await persistence.save(store);
    expect(saved.nodes).toBe(3);

    const store2 = new GraphStore();
    const loaded = await persistence.load(store2);
    expect(loaded.nodes).toBe(3);
    expect(store2.getNode("src/a.ts")).toBeDefined();
    expect(store2.getNode("src/a.ts")!.kind).toBe("file");
    expect(store2.getNode("src/a.ts::main")).toBeDefined();
    expect(store2.getNode("src/a.ts::main")!.kind).toBe("function");
    expect(store2.getNode("src/a.ts::main")!.exported).toBe(true);
  });

  test("save and load round-trips edges", async () => {
    const store = new GraphStore();
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 20 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");

    await persistence.save(store);

    const store2 = new GraphStore();
    const loaded = await persistence.load(store2);
    expect(loaded.edges).toBe(1);
    expect(store2.hasEdge("src/a.ts", "src/b.ts")).toBe(true);
  });

  test("save clears previous data", async () => {
    const store1 = new GraphStore();
    store1.addFileNode("old.ts", { loc: 10 });
    await persistence.save(store1);

    const store2 = new GraphStore();
    store2.addFileNode("new.ts", { loc: 20 });
    await persistence.save(store2);

    const store3 = new GraphStore();
    await persistence.load(store3);
    expect(store3.getNode("old.ts")).toBeUndefined();
    expect(store3.getNode("new.ts")).toBeDefined();
  });

  test("load into empty store works", async () => {
    // Save an empty store first to ensure DB is empty
    const emptyStore = new GraphStore();
    await persistence.save(emptyStore);

    const store = new GraphStore();
    const loaded = await persistence.load(store);
    expect(loaded.nodes).toBe(0);
    expect(loaded.edges).toBe(0);
  });

  test("preserves node attributes through round-trip", async () => {
    const store = new GraphStore();
    store.addSymbolNode("src/x.ts::MyClass", {
      kind: "class", name: "MyClass", filePath: "src/x.ts",
      line: 10, column: 0, exported: true, deprecated: true,
      hasAnyType: true, loc: 25, contentHash: "hash123",
    });
    store.addFileNode("src/x.ts", { loc: 100 });

    await persistence.save(store);

    const store2 = new GraphStore();
    await persistence.load(store2);
    const node = store2.getNode("src/x.ts::MyClass");
    expect(node).toBeDefined();
    expect(node!.name).toBe("MyClass");
    expect(node!.kind).toBe("class");
    expect(node!.exported).toBe(true);
    expect(node!.deprecated).toBe(true);
    expect(node!.hasAnyType).toBe(true);
    expect(node!.loc).toBe(25);
  });
});
