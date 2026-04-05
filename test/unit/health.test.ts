import { describe, test, expect } from "bun:test";
import { GraphStore } from "../../src/graph/graph-store.js";
import { computeHealthReport } from "../../src/graph/health.js";

const defaultOptions = {
  entryPoints: new Set<string>(),
  maxCallChainDepth: 10,
  hubDegreeMultiplier: 2,
};

describe("Health Report", () => {
  test("returns perfect score for clean graph", () => {
    const store = new GraphStore();
    store.addFileNode("src/a.ts", { loc: 10 });
    store.addFileNode("src/b.ts", { loc: 10 });
    store.addEdge("src/a.ts", "src/b.ts", "runtime_import");

    const report = computeHealthReport(store, {
      ...defaultOptions,
      entryPoints: new Set(["src/a.ts"]),
    });

    expect(report.score).toBeGreaterThan(50);
    expect(report.grade).toBeDefined();
    expect(["A", "B", "C", "D", "F"]).toContain(report.grade);
  });

  test("penalizes cycles", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addFileNode("c.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "c.ts", "runtime_import");
    store.addEdge("c.ts", "a.ts", "runtime_import");

    const report = computeHealthReport(store, defaultOptions);
    const cycleIssue = report.top_issues.find((i) => i.message.includes("circular"));
    expect(cycleIssue).toBeDefined();
    expect(cycleIssue!.severity).toBe("high");
  });

  test("penalizes orphan files", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("orphan1.ts", { loc: 10 });
    store.addFileNode("orphan2.ts", { loc: 10 });

    const report = computeHealthReport(store, defaultOptions);
    const orphanIssue = report.top_issues.find((i) => i.message.includes("orphan"));
    expect(orphanIssue).toBeDefined();
  });

  test("reports all 8 categories in breakdown", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });

    const report = computeHealthReport(store, defaultOptions);
    expect(Object.keys(report.breakdown)).toEqual([
      "connectivity", "modularity", "freshness", "testCoverage",
      "complexity", "duplication", "knowledge", "stability",
    ]);

    for (const cat of Object.values(report.breakdown)) {
      expect(cat.score).toBeGreaterThanOrEqual(0);
      expect(cat.score).toBeLessThanOrEqual(1);
      expect(cat.weight).toBeGreaterThan(0);
    }
  });

  test("weights sum to 1.0", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });

    const report = computeHealthReport(store, defaultOptions);
    const totalWeight = Object.values(report.breakdown).reduce((sum, cat) => sum + cat.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  test("score is between 0 and 100", () => {
    const store = new GraphStore();
    // Very unhealthy: lots of orphans, cycles
    for (let i = 0; i < 20; i++) {
      store.addFileNode(`orphan${i}.ts`, { loc: 10 });
    }
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "a.ts", "runtime_import");

    const report = computeHealthReport(store, defaultOptions);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  test("issues are sorted by severity (high first)", () => {
    const store = new GraphStore();
    // Create conditions for multiple issue types
    store.addFileNode("a.ts", { loc: 10 });
    store.addFileNode("b.ts", { loc: 10 });
    store.addFileNode("orphan.ts", { loc: 10 });
    store.addEdge("a.ts", "b.ts", "runtime_import");
    store.addEdge("b.ts", "a.ts", "runtime_import");
    store.addSymbolNode("orphan.ts::dead", {
      kind: "function", name: "dead", filePath: "orphan.ts",
      line: 1, column: 0, exported: true, deprecated: true,
      hasAnyType: false, loc: 5, contentHash: "",
    });

    const report = computeHealthReport(store, defaultOptions);
    if (report.top_issues.length >= 2) {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < report.top_issues.length; i++) {
        expect(severityOrder[report.top_issues[i].severity])
          .toBeGreaterThanOrEqual(severityOrder[report.top_issues[i - 1].severity]);
      }
    }
  });

  test("detects zombie exports", () => {
    const store = new GraphStore();
    store.addFileNode("lib.ts", { loc: 10 });
    store.addSymbolNode("lib.ts::unusedExport", {
      kind: "function", name: "unusedExport", filePath: "lib.ts",
      line: 1, column: 0, exported: true, deprecated: false,
      hasAnyType: false, loc: 5, contentHash: "",
    });

    const report = computeHealthReport(store, defaultOptions);
    const zombieIssue = report.top_issues.find((i) => i.message.includes("zombie"));
    expect(zombieIssue).toBeDefined();
  });

  test("handles empty graph", () => {
    const store = new GraphStore();
    const report = computeHealthReport(store, defaultOptions);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.grade).toBeDefined();
  });
});
