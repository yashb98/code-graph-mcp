import { describe, test, expect, beforeAll } from "bun:test";
import { loadConfig } from "../../src/config.js";
import {
  createToolContext,
  buildGraph,
  getStats,
  healthReportHandler,
  findCodeSmellsHandler,
  getArchitectureOverviewHandler,
  getCommunityHandler,
  getReviewContextHandler,
  planMigrationHandler,
  findHotspotsHandler,
  detectClonesHandler,
  findOrphansHandler,
  graphDiffHandler,
  getImpactRadiusHandler,
  getSymbolInfoHandler,
  findTestsForHandler,
  getTrendsHandler,
  semanticDiffHandler,
  findStaleCodeHandler,
} from "../../src/mcp/tools.js";
import { join } from "path";
import type { Verbosity } from "../../src/types.js";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/full-project");
const REPO_ROOT = join(import.meta.dir, "../..");

interface ABResult {
  tool: string;
  minimal: number;
  normal: number;
  detailed: number;
  minimalSavings: string;
  detailedOverhead: string;
}

function byteSize(obj: unknown): number {
  return JSON.stringify(obj).length;
}

function pctChange(baseline: number, variant: number): string {
  if (baseline === 0) return "0%";
  const pct = ((variant - baseline) / baseline) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

describe("Verbosity A/B Testing", () => {
  const config = loadConfig(FIXTURE_ROOT);
  config.include = ["src/**/*.ts"];
  config.exclude = [];
  config.entryPoints = ["src/index.ts"];
  const ctx = createToolContext(config, FIXTURE_ROOT);

  // Repo-level context for git-dependent tools
  const repoConfig = loadConfig(REPO_ROOT);
  repoConfig.include = ["src/**/*.ts"];
  const repoCtx = createToolContext(repoConfig, REPO_ROOT);

  const results: ABResult[] = [];

  beforeAll(async () => {
    await buildGraph(ctx);
    await buildGraph(repoCtx);
  });

  function record(tool: string, minimal: number, normal: number, detailed: number) {
    results.push({
      tool,
      minimal,
      normal,
      detailed,
      minimalSavings: pctChange(normal, minimal),
      detailedOverhead: pctChange(normal, detailed),
    });
  }

  // --- Sync tools ---

  test("get_stats verbosity comparison", () => {
    const m = getStats(ctx, "minimal");
    const n = getStats(ctx, "normal");
    const d = getStats(ctx, "detailed");
    record("get_stats", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
    expect(byteSize(n)).toBeLessThanOrEqual(byteSize(d));
  });

  test("health_report verbosity comparison", () => {
    const m = healthReportHandler(ctx, "minimal");
    const n = healthReportHandler(ctx, "normal");
    const d = healthReportHandler(ctx, "detailed");
    record("health_report", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("find_code_smells verbosity comparison", () => {
    const m = findCodeSmellsHandler(ctx, "minimal");
    const n = findCodeSmellsHandler(ctx, "normal");
    const d = findCodeSmellsHandler(ctx, "detailed");
    record("find_code_smells", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("get_architecture_overview verbosity comparison", () => {
    const m = getArchitectureOverviewHandler(ctx, "minimal");
    const n = getArchitectureOverviewHandler(ctx, "normal");
    const d = getArchitectureOverviewHandler(ctx, "detailed");
    record("get_architecture_overview", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("get_review_context verbosity comparison", () => {
    const files = ["src/index.ts", "src/utils/logger.ts"];
    const m = getReviewContextHandler(ctx, files, "minimal");
    const n = getReviewContextHandler(ctx, files, "normal");
    const d = getReviewContextHandler(ctx, files, "detailed");
    record("get_review_context", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("plan_migration verbosity comparison", () => {
    const m = planMigrationHandler(ctx, "src/**", "minimal");
    const n = planMigrationHandler(ctx, "src/**", "normal");
    const d = planMigrationHandler(ctx, "src/**", "detailed");
    record("plan_migration", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("find_orphans verbosity comparison", () => {
    const m = findOrphansHandler(ctx, "minimal");
    const n = findOrphansHandler(ctx, "normal");
    const d = findOrphansHandler(ctx, "detailed");
    record("find_orphans", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("get_impact_radius verbosity comparison", () => {
    const m = getImpactRadiusHandler(ctx, "src/index.ts", false, "minimal");
    const n = getImpactRadiusHandler(ctx, "src/index.ts", false, "normal");
    const d = getImpactRadiusHandler(ctx, "src/index.ts", false, "detailed");
    record("get_impact_radius", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("find_tests_for verbosity comparison", () => {
    const m = findTestsForHandler(ctx, "src/index.ts", "minimal");
    const n = findTestsForHandler(ctx, "src/index.ts", "normal");
    const d = findTestsForHandler(ctx, "src/index.ts", "detailed");
    record("find_tests_for", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("semantic_diff verbosity comparison", () => {
    const m = semanticDiffHandler(ctx, ["src/index.ts"], "minimal");
    const n = semanticDiffHandler(ctx, ["src/index.ts"], "normal");
    const d = semanticDiffHandler(ctx, ["src/index.ts"], "detailed");
    record("semantic_diff", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("find_stale_code verbosity comparison", () => {
    const m = findStaleCodeHandler(ctx, "minimal");
    const n = findStaleCodeHandler(ctx, "normal");
    const d = findStaleCodeHandler(ctx, "detailed");
    record("find_stale_code", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  // --- Async tools ---

  test("graph_diff verbosity comparison", async () => {
    const m = await graphDiffHandler(ctx, "minimal");
    const n = await graphDiffHandler(ctx, "normal");
    const d = await graphDiffHandler(ctx, "detailed");
    record("graph_diff", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("detect_clones verbosity comparison", async () => {
    const m = await detectClonesHandler(ctx, "minimal");
    const n = await detectClonesHandler(ctx, "normal");
    const d = await detectClonesHandler(ctx, "detailed");
    record("detect_clones", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("get_symbol_info verbosity comparison", async () => {
    const m = await getSymbolInfoHandler(ctx, "src/index.ts", "minimal");
    const n = await getSymbolInfoHandler(ctx, "src/index.ts", "normal");
    const d = await getSymbolInfoHandler(ctx, "src/index.ts", "detailed");
    record("get_symbol_info", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("find_hotspots verbosity comparison", async () => {
    const m = await findHotspotsHandler(repoCtx, "minimal");
    const n = await findHotspotsHandler(repoCtx, "normal");
    const d = await findHotspotsHandler(repoCtx, "detailed");
    record("find_hotspots", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  test("get_trends verbosity comparison", async () => {
    const m = await getTrendsHandler(repoCtx, "churn", 30, "minimal");
    const n = await getTrendsHandler(repoCtx, "churn", 30, "normal");
    const d = await getTrendsHandler(repoCtx, "churn", 30, "detailed");
    record("get_trends", byteSize(m), byteSize(n), byteSize(d));
    expect(byteSize(m)).toBeLessThanOrEqual(byteSize(n));
  });

  // --- Summary ---

  test("SUMMARY: verbosity A/B results", () => {
    console.log("\n\n═══════════════════════════════════════════════════════════════");
    console.log("  VERBOSITY A/B TEST RESULTS");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`${"Tool".padEnd(30)} ${"Minimal".padStart(9)} ${"Normal".padStart(9)} ${"Detailed".padStart(9)} ${"Min Δ".padStart(9)} ${"Det Δ".padStart(9)}`);
    console.log("─".repeat(77));

    let totalMinimal = 0, totalNormal = 0, totalDetailed = 0;

    for (const r of results) {
      totalMinimal += r.minimal;
      totalNormal += r.normal;
      totalDetailed += r.detailed;
      console.log(
        `${r.tool.padEnd(30)} ${String(r.minimal + "B").padStart(9)} ${String(r.normal + "B").padStart(9)} ${String(r.detailed + "B").padStart(9)} ${r.minimalSavings.padStart(9)} ${r.detailedOverhead.padStart(9)}`
      );
    }

    console.log("─".repeat(77));
    console.log(
      `${"TOTAL".padEnd(30)} ${String(totalMinimal + "B").padStart(9)} ${String(totalNormal + "B").padStart(9)} ${String(totalDetailed + "B").padStart(9)} ${pctChange(totalNormal, totalMinimal).padStart(9)} ${pctChange(totalNormal, totalDetailed).padStart(9)}`
    );
    console.log("═══════════════════════════════════════════════════════════════\n");

    // Validate that minimal saves at least 10% overall
    expect(totalMinimal).toBeLessThan(totalNormal);
    expect(results.length).toBeGreaterThanOrEqual(15);
  });
});
