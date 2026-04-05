import { describe, test, expect, beforeEach } from "bun:test";
import { GraphStore } from "../../src/graph/graph-store.js";
import { detectCommunities, assignCommunities } from "../../src/graph/community.js";
import {
  findCycles,
  getConnectedComponents,
  findOrphans,
  findHubNodes,
  findBridgeNodes,
  getCallChainDepths,
} from "../../src/graph/analysis.js";

describe("Community Detection", () => {
  test("detects communities in graph with clusters", () => {
    const store = new GraphStore();
    // Cluster A
    store.addFileNode("src/a/index.ts", { loc: 10 });
    store.addFileNode("src/a/utils.ts", { loc: 10 });
    store.addEdge("src/a/index.ts", "src/a/utils.ts", "runtime_import");
    // Cluster B
    store.addFileNode("src/b/index.ts", { loc: 10 });
    store.addFileNode("src/b/helpers.ts", { loc: 10 });
    store.addEdge("src/b/index.ts", "src/b/helpers.ts", "runtime_import");
    // Cross-cluster
    store.addEdge("src/a/index.ts", "src/b/index.ts", "runtime_import");

    const result = detectCommunities(store);
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.modularity).toBeGreaterThanOrEqual(0);
    expect(Object.keys(result.communities).length).toBe(4);
  });

  test("handles empty graph", () => {
    const store = new GraphStore();
    const result = detectCommunities(store);
    expect(result.count).toBe(0);
    expect(result.modularity).toBe(0);
  });

  test("handles graph with no edges", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });

    const result = detectCommunities(store);
    expect(result.count).toBe(2);
  });

  test("assigns communities to graph nodes", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });

    assignCommunities(store, { "a.ts": 0, "b.ts": 1 });

    const aAttrs = store.graph.getNodeAttributes("a.ts");
    expect(aAttrs.community).toBe(0);
  });
});

describe("Cycle Detection (Tarjan's SCC)", () => {
  test("detects circular imports", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addFileNode("c.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "c.ts", "runtime_import");
    store.addEdge("c.ts", "a.ts", "runtime_import");

    const cycles = findCycles(store);
    expect(cycles.length).toBe(1);
    expect(cycles[0].length).toBe(3);
    expect(cycles[0]).toContain("a.ts");
    expect(cycles[0]).toContain("b.ts");
    expect(cycles[0]).toContain("c.ts");
  });

  test("returns empty for acyclic graph", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");

    const cycles = findCycles(store);
    expect(cycles.length).toBe(0);
  });

  test("detects multiple independent cycles", () => {
    const store = new GraphStore();
    // Cycle 1: a <-> b
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "a.ts", "runtime_import");
    // Cycle 2: c <-> d
    store.addFileNode("c.ts", { loc: 10 });
    store.addFileNode("d.ts", { loc: 10 });
    store.addEdge("c.ts", "d.ts", "runtime_import");
    store.addEdge("d.ts", "c.ts", "runtime_import");

    const cycles = findCycles(store);
    expect(cycles.length).toBe(2);
  });
});

describe("Connected Components", () => {
  test("finds separate components", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    // Isolated
    store.addFileNode("c.ts", { loc: 10 });

    const components = getConnectedComponents(store);
    expect(components.length).toBe(2);
  });

  test("single connected graph returns one component", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addFileNode("c.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "c.ts", "runtime_import");

    const components = getConnectedComponents(store);
    expect(components.length).toBe(1);
    expect(components[0].length).toBe(3);
  });
});

describe("Orphan Detection", () => {
  test("finds orphan files, functions, and zombie exports", () => {
    const store = new GraphStore();
    store.addFileNode("src/index.ts", { loc: 10 });
    store.addFileNode("src/used.ts", { loc: 10 });
    store.addFileNode("src/unused.ts", { loc: 10 });
    store.addEdge("src/index.ts", "src/used.ts", "runtime_import");

    // Add an exported function that nobody references
    store.addSymbolNode("src/unused.ts::deadFn", {
      kind: "function", name: "deadFn", filePath: "src/unused.ts",
      line: 1, column: 0, exported: true, deprecated: false,
      hasAnyType: false, loc: 5, contentHash: "",
    });

    const orphans = findOrphans(store, new Set(["src/index.ts"]));
    expect(orphans.files).toContain("src/unused.ts");
    expect(orphans.files).not.toContain("src/used.ts");
    expect(orphans.zombieExports).toContain("src/unused.ts::deadFn");
  });
});

describe("Hub Nodes", () => {
  test("finds hub nodes above threshold", () => {
    const store = new GraphStore();
    store.addFileNode("hub.ts", { loc: 100 });
    for (let i = 0; i < 10; i++) {
      store.addFileNode(`dep${i}.ts`, { loc: 10 });
      store.addEdge(`dep${i}.ts`, "hub.ts", "runtime_import");
    }

    const hubs = findHubNodes(store, 2);
    expect(hubs).toContain("hub.ts");
  });

  test("returns empty for empty graph", () => {
    const store = new GraphStore();
    expect(findHubNodes(store)).toEqual([]);
  });
});

describe("Bridge Nodes", () => {
  test("finds articulation points", () => {
    const store = new GraphStore();
    // A -- B -- C (B is an articulation point)
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addFileNode("c.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "c.ts", "runtime_import");

    const bridges = findBridgeNodes(store);
    expect(bridges).toContain("b.ts");
  });
});

describe("Call Chain Depths", () => {
  test("computes BFS depths from entry points", () => {
    const store = new GraphStore();
    store.addFileNode("entry.ts", { loc: 10 });
    store.addFileNode("lib.ts", { loc: 10 });
    store.addFileNode("deep.ts", { loc: 10 });
    store.addEdge("entry.ts", "lib.ts", "runtime_import");
    store.addEdge("lib.ts", "deep.ts", "runtime_import");

    const depths = getCallChainDepths(store, new Set(["entry.ts"]));
    expect(depths.get("entry.ts")).toBe(0);
    expect(depths.get("lib.ts")).toBe(1);
    expect(depths.get("deep.ts")).toBe(2);
  });

  test("respects max depth", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addFileNode("c.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "c.ts", "runtime_import");

    const depths = getCallChainDepths(store, new Set(["a.ts"]), 1);
    expect(depths.get("a.ts")).toBe(0);
    expect(depths.get("b.ts")).toBe(1);
    expect(depths.has("c.ts")).toBe(false);
  });
});
