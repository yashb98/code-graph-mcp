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
  findCodeSmellsHandler,
  getArchitectureOverviewHandler,
  getCommunityHandler,
  getReviewContextHandler,
  planMigrationHandler,
} from "../../src/mcp/tools.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/full-project");

describe("Verbosity Integration", () => {
  const config = loadConfig(FIXTURE_ROOT);
  config.include = ["src/**/*.ts"];
  config.exclude = [];
  config.entryPoints = ["src/index.ts"];
  const ctx = createToolContext(config, FIXTURE_ROOT);

  beforeAll(async () => {
    await buildGraph(ctx);
  });

  test("get_stats works at all verbosity levels", () => {
    const minimal = getStats(ctx, "minimal");
    const normal = getStats(ctx, "normal");
    const detailed = getStats(ctx, "detailed");
    // All should have the same core fields
    expect(minimal.nodeCount).toBe(normal.nodeCount);
    expect(normal.nodeCount).toBe(detailed.nodeCount);
  });

  test("query_dependencies minimal truncates results", () => {
    const normal = queryDependencies(ctx, "src/index.ts", 1, "normal");
    const minimal = queryDependencies(ctx, "src/index.ts", 1, "minimal");
    // Minimal should have at most 5 items
    expect(minimal.dependencies.length).toBeLessThanOrEqual(5);
    // Normal should have the full set (it's a small fixture)
    expect(normal.dependencies.length).toBeGreaterThan(0);
  });

  test("query_dependents minimal truncates results", () => {
    const minimal = queryDependents(ctx, "src/utils/logger.ts", 1, "minimal");
    expect(minimal.dependents.length).toBeLessThanOrEqual(5);
  });

  test("detect_cycles minimal shows fewer cycles", () => {
    const minimal = detectCyclesHandler(ctx, "minimal");
    expect(minimal.count).toBeDefined();
    expect(minimal.cycles.length).toBeLessThanOrEqual(3);
  });

  test("find_orphans includes counts object", () => {
    const result = findOrphansHandler(ctx, "normal");
    expect(result.counts).toBeDefined();
    expect(typeof result.counts.files).toBe("number");
    expect(typeof result.counts.functions).toBe("number");
    expect(typeof result.counts.zombieExports).toBe("number");
  });

  test("find_code_smells minimal returns fewer smells", () => {
    const minimal = findCodeSmellsHandler(ctx, "minimal");
    const normal = findCodeSmellsHandler(ctx, "normal");
    expect(minimal.count).toBe(normal.count); // Count is always full
    expect(minimal.smells.length).toBeLessThanOrEqual(5);
  });

  test("get_architecture_overview works at all levels", () => {
    const minimal = getArchitectureOverviewHandler(ctx, "minimal");
    const detailed = getArchitectureOverviewHandler(ctx, "detailed");
    expect(minimal.stats.fileCount).toBe(detailed.stats.fileCount);
    expect(minimal.communities.count).toBe(detailed.communities.count);
  });

  test("get_review_context minimal truncates symbols", () => {
    const minimal = getReviewContextHandler(ctx, ["src/index.ts"], "minimal");
    const detailed = getReviewContextHandler(ctx, ["src/index.ts"], "detailed");
    expect(minimal.files[0].exists).toBe(true);
    expect(minimal.files[0].symbols.length).toBeLessThanOrEqual(5);
    expect(detailed.files[0].symbols.length).toBeGreaterThanOrEqual(minimal.files[0].symbols.length);
  });

  test("plan_migration works with verbosity", () => {
    const result = planMigrationHandler(ctx, "src/**", "minimal");
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.phases.length).toBeGreaterThan(0);
  });
});
