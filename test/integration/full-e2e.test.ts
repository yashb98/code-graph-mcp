import { describe, test, expect, beforeAll } from "bun:test";
import { loadConfig } from "../../src/config.js";
import {
  createToolContext,
  buildGraph,
  getStats,
  queryDependencies,
  queryDependents,
  detectCyclesHandler,
  findOrphansHandler,
  healthReportHandler,
  checkArchitectureRulesHandler,
  getChangeCouplingHandler,
  getKnowledgeMapHandler,
  getChangeRiskHandler,
} from "../../src/mcp/tools.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/full-project");

describe("Full E2E Workflow", () => {
  const config = loadConfig(FIXTURE_ROOT);
  config.include = ["src/**/*.ts"];
  config.exclude = [];
  config.entryPoints = ["src/index.ts"];
  config.architectureRules = [
    {
      id: "no-unused-to-services",
      name: "Unused module should not access services",
      description: "",
      type: "dependency",
      rule: { source: "src/unused*", target: "src/services/**", allow: false },
      severity: "warning",
    },
  ];
  const ctx = createToolContext(config, FIXTURE_ROOT);

  test("step 1: build graph successfully", async () => {
    const result = await buildGraph(ctx);
    expect(result.filesParsed).toBe(5);
    expect(result.nodeCount).toBeGreaterThan(5);
    expect(result.edgeCount).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
    expect(result.timeMs).toBeGreaterThan(0);
  });

  test("step 2: get stats", () => {
    const stats = getStats(ctx);
    expect(stats.fileCount).toBe(5);
    expect(stats.symbolCount).toBeGreaterThan(0);
    expect(stats.communities).toBeGreaterThanOrEqual(1);
    expect(stats.built).toBe(true);
  });

  test("step 3: query dependencies chain", () => {
    const deps = queryDependencies(ctx, "src/index.ts", 2);
    expect(deps.dependencies.length).toBeGreaterThan(0);
    // index.ts -> user-service -> logger/types (transitive)
    expect(deps.transitive).toBeDefined();
  });

  test("step 4: query dependents (impact radius)", () => {
    const dependents = queryDependents(ctx, "src/utils/logger.ts");
    expect(dependents.dependents).toContain("src/index.ts");
    expect(dependents.dependents).toContain("src/services/user-service.ts");
  });

  test("step 5: detect cycles (should be clean)", () => {
    const cycles = detectCyclesHandler(ctx);
    expect(cycles.count).toBe(0);
  });

  test("step 6: find orphans", () => {
    const orphans = findOrphansHandler(ctx);
    expect(orphans.files).toContain("src/unused.ts");
    expect(orphans.files).not.toContain("src/index.ts");
  });

  test("step 7: health report", () => {
    const report = healthReportHandler(ctx);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.grade).toBeDefined();
    expect(Object.keys(report.breakdown).length).toBe(8);
  });

  test("step 8: architecture rules", () => {
    const violations = checkArchitectureRulesHandler(ctx);
    // unused.ts doesn't import services, so no violations
    expect(violations.length).toBe(0);
  });

  test("step 9: all tools return structured data", async () => {
    // Verify each tool returns JSON-serializable results
    const results = [
      await buildGraph(ctx),
      getStats(ctx),
      queryDependencies(ctx, "src/index.ts"),
      queryDependents(ctx, "src/utils/logger.ts"),
      detectCyclesHandler(ctx),
      findOrphansHandler(ctx),
      healthReportHandler(ctx),
      checkArchitectureRulesHandler(ctx),
    ];

    for (const result of results) {
      expect(() => JSON.stringify(result)).not.toThrow();
    }
  });
});
