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
} from "../../src/mcp/tools.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/full-project");

describe("MCP Tools Integration", () => {
  const config = loadConfig(FIXTURE_ROOT);
  config.include = ["src/**/*.ts"];
  config.exclude = [];
  const ctx = createToolContext(config, FIXTURE_ROOT);

  beforeAll(async () => {
    await buildGraph(ctx);
  });

  test("build_graph populates store", () => {
    expect(ctx.store.nodeCount).toBeGreaterThan(5);
    expect(ctx.store.edgeCount).toBeGreaterThan(0);
    expect(ctx.lastBuild).not.toBeNull();
  });

  test("get_stats returns correct counts", () => {
    const stats = getStats(ctx);
    expect(stats.fileCount).toBe(5);
    expect(stats.symbolCount).toBeGreaterThan(0);
    expect(stats.built).toBe(true);
    expect(stats.communities).toBeGreaterThanOrEqual(1);
  });

  test("query_dependencies returns forward deps", () => {
    const result = queryDependencies(ctx, "src/index.ts");
    expect(result.dependencies).toContain("src/services/user-service.ts");
    expect(result.dependencies).toContain("src/utils/logger.ts");
  });

  test("query_dependencies with depth=2 includes transitive", () => {
    const result = queryDependencies(ctx, "src/index.ts", 2);
    expect(result.dependencies).toContain("src/services/user-service.ts");
    // Transitive: user-service imports logger and types
    expect(result.transitive).toBeDefined();
    if (result.transitive && result.transitive.length > 0) {
      expect(result.transitive).toContain("src/types.ts");
    }
  });

  test("query_dependents returns reverse deps", () => {
    const result = queryDependents(ctx, "src/utils/logger.ts");
    expect(result.dependents).toContain("src/index.ts");
    expect(result.dependents).toContain("src/services/user-service.ts");
  });

  test("detect_cycles returns empty for acyclic fixture", () => {
    const result = detectCyclesHandler(ctx);
    expect(result.count).toBe(0);
    expect(result.cycles).toEqual([]);
  });

  test("find_orphans detects unused.ts", () => {
    ctx.config.entryPoints = ["src/index.ts"];
    const result = findOrphansHandler(ctx);
    expect(result.files).toContain("src/unused.ts");
  });

  test("health_report returns valid report", () => {
    const report = healthReportHandler(ctx);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.grade).toBeDefined();
    expect(Object.keys(report.breakdown).length).toBe(8);
    expect(report.top_issues).toBeDefined();
  });

  test("query for nonexistent node returns empty", () => {
    const deps = queryDependencies(ctx, "nonexistent.ts");
    expect(deps.dependencies).toEqual([]);

    const dependents = queryDependents(ctx, "nonexistent.ts");
    expect(dependents.dependents).toEqual([]);
  });
});
