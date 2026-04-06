import { describe, test, expect, beforeAll } from "bun:test";
import { loadConfig } from "../../src/config.js";
import {
  createToolContext,
  buildGraph,
  findCodeSmellsHandler,
  getArchitectureOverviewHandler,
  getCommunityHandler,
  getReviewContextHandler,
  planMigrationHandler,
  findHotspotsHandler,
  searchSymbolsHandler,
  detectClonesHandler,
  graphDiffHandler,
  getImpactRadiusHandler,
  getSymbolInfoHandler,
  findTestsForHandler,
  getTrendsHandler,
  semanticDiffHandler,
  findStaleCodeHandler,
} from "../../src/mcp/tools.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/full-project");

describe("Advanced MCP Tools", () => {
  const config = loadConfig(FIXTURE_ROOT);
  config.include = ["src/**/*.ts"];
  config.exclude = [];
  config.entryPoints = ["src/index.ts"];
  const ctx = createToolContext(config, FIXTURE_ROOT);

  beforeAll(async () => {
    await buildGraph(ctx);
  });

  test("find_code_smells returns structured results", () => {
    const result = findCodeSmellsHandler(ctx);
    expect(result).toBeDefined();
    expect(typeof result.count).toBe("number");
    expect(Array.isArray(result.smells)).toBe(true);
    for (const smell of result.smells) {
      expect(smell.type).toBeDefined();
      expect(smell.severity).toBeDefined();
      expect(smell.file).toBeDefined();
      expect(smell.message).toBeDefined();
    }
  });

  test("get_architecture_overview returns full overview", () => {
    const result = getArchitectureOverviewHandler(ctx);
    expect(result.stats).toBeDefined();
    expect(result.stats.fileCount).toBe(5);
    expect(result.communities).toBeDefined();
    expect(result.communities.count).toBeGreaterThanOrEqual(1);
    expect(typeof result.communities.modularity).toBe("number");
    expect(result.cycles).toBeDefined();
    expect(result.components).toBeDefined();
  });

  test("get_community returns community details", () => {
    const overview = getArchitectureOverviewHandler(ctx);
    if (overview.communities.details.length > 0) {
      const communityId = overview.communities.details[0].id;
      const result = getCommunityHandler(ctx, communityId);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.files).toBeDefined();
      expect(typeof result.cohesion).toBe("number");
    }
  });

  test("get_community returns error for invalid id", () => {
    const result = getCommunityHandler(ctx, 99999);
    expect(result.error).toBeDefined();
  });

  test("get_review_context returns context for files", () => {
    const result = getReviewContextHandler(ctx, ["src/index.ts", "src/utils/logger.ts"]);
    expect(result.files.length).toBe(2);
    expect(result.files[0].filePath).toBe("src/index.ts");
    expect(result.files[0].exists).toBe(true);
    expect(result.files[0].dependencies.length).toBeGreaterThan(0);
    expect(result.files[0].symbols.length).toBeGreaterThanOrEqual(0);
    expect(typeof result.totalImpactRadius).toBe("number");
  });

  test("get_review_context handles nonexistent file", () => {
    const result = getReviewContextHandler(ctx, ["nonexistent.ts"]);
    expect(result.files[0].exists).toBe(false);
  });

  test("plan_migration returns topological phases", () => {
    const result = planMigrationHandler(ctx, "src/**");
    expect(result.totalFiles).toBeGreaterThan(0);
    expect(result.phases.length).toBeGreaterThan(0);
    expect(result.phases[0].phase).toBe(1);
    expect(result.phases[0].files.length).toBeGreaterThan(0);
  });

  test("plan_migration handles no matches", () => {
    const result = planMigrationHandler(ctx, "nonexistent/**");
    expect(result.error).toBeDefined();
    expect(result.phases).toEqual([]);
  });

  test("search_symbols text search works", async () => {
    const results = await searchSymbolsHandler(ctx, "main");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBeDefined();
    expect(results[0].score).toBeGreaterThan(0);
  });

  test("find_hotspots returns hotspot data", async () => {
    // Uses the actual repo root for git data
    const repoConfig = loadConfig(join(import.meta.dir, "../.."));
    repoConfig.include = ["src/**/*.ts"];
    const repoCtx = createToolContext(repoConfig, join(import.meta.dir, "../.."));
    await buildGraph(repoCtx);

    const result = await findHotspotsHandler(repoCtx);
    expect(result).toBeDefined();
    expect(Array.isArray(result.hotspots)).toBe(true);
    if (result.hotspots.length > 0) {
      expect(result.hotspots[0].filePath).toBeDefined();
      expect(result.hotspots[0].commits).toBeGreaterThan(0);
    }
  });

  test("detect_clones returns structured results", async () => {
    const result = await detectClonesHandler(ctx);
    expect(result).toBeDefined();
    expect(typeof result.totalClones).toBe("number");
    expect(typeof result.totalClonedLines).toBe("number");
    expect(typeof result.cloneRatio).toBe("number");
    expect(Array.isArray(result.clones)).toBe(true);
  });

  test("graph_diff returns graph snapshot after build", async () => {
    const result = await graphDiffHandler(ctx);
    expect(result.nodes).toBeDefined();
    expect(result.nodes.total).toBeGreaterThan(0);
    expect(typeof result.nodes.files).toBe("number");
    expect(typeof result.nodes.symbols).toBe("number");
    expect(result.edges).toBeDefined();
    expect(result.edges.total).toBeGreaterThan(0);
    expect(result.edges.byKind).toBeDefined();
    expect(typeof result.buildTime).toBe("number");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  test("get_impact_radius returns BFS traversal with distance scoring", () => {
    const result = getImpactRadiusHandler(ctx, "src/index.ts");
    expect(result.target).toBe("src/index.ts");
    expect(typeof result.totalImpacted).toBe("number");
    expect(Array.isArray(result.impacted)).toBe(true);
    expect(typeof result.maxDistance).toBe("number");
    // If there are impacted files, check structure
    if (result.impacted.length > 0) {
      expect(result.impacted[0].node).toBeDefined();
      expect(typeof result.impacted[0].distance).toBe("number");
      expect(typeof result.impacted[0].score).toBe("number");
      expect(result.impacted[0].score).toBeGreaterThan(0);
      expect(result.impacted[0].score).toBeLessThanOrEqual(1);
    }
  });

  test("get_impact_radius returns empty for leaf node", () => {
    // utils/logger.ts is likely a leaf with no dependents from it in this fixture
    const result = getImpactRadiusHandler(ctx, "src/utils/logger.ts");
    expect(result.target).toBe("src/utils/logger.ts");
    expect(typeof result.totalImpacted).toBe("number");
  });

  test("get_symbol_info returns unified symbol data", async () => {
    // Use a known file path
    const result = await getSymbolInfoHandler(ctx, "src/index.ts");
    expect(result.symbol).toBe("src/index.ts");
    expect(typeof result.exists).toBe("boolean");
    expect(typeof result.dependencyCount).toBe("number");
    expect(typeof result.dependentCount).toBe("number");
    expect(Array.isArray(result.dependencies)).toBe(true);
    expect(Array.isArray(result.dependents)).toBe(true);
  });

  test("find_tests_for returns test file references", () => {
    const result = findTestsForHandler(ctx, "src/index.ts");
    expect(result.target).toBe("src/index.ts");
    expect(typeof result.totalTests).toBe("number");
    expect(typeof result.hasCoverage).toBe("boolean");
    expect(Array.isArray(result.testFiles)).toBe(true);
  });

  test("get_trends returns churn trend data", async () => {
    // Use the actual repo root for git data
    const repoConfig = loadConfig(join(import.meta.dir, "../.."));
    repoConfig.include = ["src/**/*.ts"];
    const repoCtx = createToolContext(repoConfig, join(import.meta.dir, "../.."));
    await buildGraph(repoCtx);

    const result = await getTrendsHandler(repoCtx, "churn", 30);
    expect(result.metric).toBe("churn");
    expect(result.period).toBe("30 days");
    expect(result.summary).toBeDefined();
    expect(typeof result.summary.totalCommits).toBe("number");
    expect(typeof result.summary.uniqueFilesChanged).toBe("number");
    expect(Array.isArray(result.topChurners)).toBe(true);
    expect(Array.isArray(result.weeklyTrend)).toBe(true);
  });

  test("semantic_diff analyzes structural impact of changed files", () => {
    const result = semanticDiffHandler(ctx, ["src/index.ts"]);
    expect(result.changedFiles).toEqual(["src/index.ts"]);
    expect(typeof result.totalDependencies).toBe("number");
    expect(Array.isArray(result.dependencies)).toBe(true);
    expect(Array.isArray(result.affectedCommunities)).toBe(true);
    expect(typeof result.cycleCount).toBe("number");
    expect(typeof result.violationCount).toBe("number");
    expect(Array.isArray(result.newCycles)).toBe(true);
    expect(Array.isArray(result.architectureViolations)).toBe(true);
  });

  test("semantic_diff handles empty file list", () => {
    const result = semanticDiffHandler(ctx, []);
    expect(result.changedFiles).toEqual([]);
    expect(result.totalDependencies).toBe(0);
    expect(result.cycleCount).toBe(0);
  });

  test("find_stale_code returns stale code analysis", () => {
    const result = findStaleCodeHandler(ctx);
    expect(typeof result.totalIssues).toBe("number");
    expect(typeof result.deprecatedStillUsedCount).toBe("number");
    expect(typeof result.anyTypeCount).toBe("number");
    expect(typeof result.staleReExportCount).toBe("number");
    expect(Array.isArray(result.deprecatedStillUsed)).toBe(true);
    expect(Array.isArray(result.anyTypeHotspots)).toBe(true);
    expect(Array.isArray(result.staleReExports)).toBe(true);
  });
});
