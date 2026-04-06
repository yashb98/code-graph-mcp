import type { HealthReport, CategoryScore, Issue } from "../types.js";
import type { GraphStore } from "./graph-store.js";
import { findCycles, findOrphans, findHubNodes, findBridgeNodes, getConnectedComponents } from "./analysis.js";
import { detectCommunities } from "./community.js";

interface HealthOptions {
  entryPoints: Set<string>;
  maxCallChainDepth: number;
  hubDegreeMultiplier: number;
  /** Clone ratio from clone detection (0-1). Default: 0 (no clones) */
  cloneRatio?: number;
  /** Knowledge silo ratio (siloFiles / totalFiles). Default: 0 */
  siloRatio?: number;
  /** Average knowledge score across files (0-1). Default: 1 */
  avgKnowledgeScore?: number;
  /** File churn stability: ratio of files changed recently. Default: 0 */
  recentChurnRatio?: number;
}

const WEIGHTS = {
  connectivity: 0.20,
  modularity: 0.15,
  freshness: 0.15,
  testCoverage: 0.15,
  complexity: 0.10,
  duplication: 0.05,
  knowledge: 0.10,
  stability: 0.10,
};

export function computeHealthReport(store: GraphStore, options: HealthOptions): HealthReport {
  const issues: Issue[] = [];

  // 1. Connectivity
  const orphanResult = findOrphans(store, options.entryPoints);
  const bridges = findBridgeNodes(store);
  const components = getConnectedComponents(store);
  const fileCount = store.getStats().fileCount;

  const orphanRatio = fileCount > 0 ? orphanResult.files.length / fileCount : 0;
  const bridgeRatio = fileCount > 0 ? bridges.length / fileCount : 0;
  const componentPenalty = components.length > 1 ? Math.min((components.length - 1) * 0.05, 0.3) : 0;
  const connectivityScore = Math.max(0, 1 - orphanRatio * 2 - bridgeRatio - componentPenalty);

  if (orphanResult.files.length > 0) {
    issues.push({ severity: "medium", message: `${orphanResult.files.length} orphan files with no importers`, tool: "find_orphans", new: false });
  }
  if (bridges.length > 0) {
    issues.push({ severity: "high", message: `${bridges.length} single-point-of-failure bridge nodes`, tool: "find_bridge_nodes", new: false });
  }

  // 2. Modularity
  const communityResult = detectCommunities(store);
  const modScore = communityResult.modularity;
  const modNormalized = Math.min(1, Math.max(0, modScore * 2));

  // 3. Freshness (deprecated, any, zombie)
  let deprecatedCount = 0;
  let anyTypeCount = 0;
  let totalSymbols = 0;
  store.forEachNode((_, attrs) => {
    if (attrs.kind !== "file") {
      totalSymbols++;
      if (attrs.deprecated) deprecatedCount++;
      if (attrs.hasAnyType) anyTypeCount++;
    }
  });
  const zombieCount = orphanResult.zombieExports.length;
  const freshnessIssues = totalSymbols > 0
    ? (deprecatedCount + anyTypeCount + zombieCount) / totalSymbols
    : 0;
  const freshnessScore = Math.max(0, 1 - freshnessIssues * 3);

  if (deprecatedCount > 0) {
    issues.push({ severity: "low", message: `${deprecatedCount} deprecated symbols still in codebase`, tool: "find_stale_code", new: false });
  }
  if (zombieCount > 0) {
    issues.push({ severity: "medium", message: `${zombieCount} zombie exports (exported but never imported)`, tool: "find_orphans", new: false });
  }

  // 4. Test Coverage (edges of kind "tests")
  let testedFiles = 0;
  store.forEachEdge((_, attrs, source, target) => {
    if (attrs.kind === "tests") testedFiles++;
  });
  const testRatio = fileCount > 0 ? testedFiles / fileCount : 0;
  const testScore = Math.min(1, testRatio);

  if (testRatio < 0.5) {
    issues.push({ severity: "high", message: `Only ${Math.round(testRatio * 100)}% of files have test coverage edges`, tool: "query_graph", new: false });
  }

  // 5. Complexity (cycles, depth)
  const cycles = findCycles(store);
  const cyclePenalty = Math.min(cycles.length * 0.1, 0.5);
  const hubs = findHubNodes(store, options.hubDegreeMultiplier);
  const hubPenalty = Math.min(hubs.length * 0.05, 0.3);
  const complexityScore = Math.max(0, 1 - cyclePenalty - hubPenalty);

  if (cycles.length > 0) {
    issues.push({ severity: "high", message: `${cycles.length} circular dependency cycles detected`, tool: "detect_cycles", new: false });
  }
  if (hubs.length > 0) {
    issues.push({ severity: "medium", message: `${hubs.length} hub nodes with abnormally high connections`, tool: "find_hub_nodes", new: false });
  }

  // 6. Duplication — based on clone detection ratio
  const cloneRatio = options.cloneRatio ?? 0;
  const duplicationScore = Math.max(0, 1 - cloneRatio * 3); // 33% clones = 0 score

  if (cloneRatio > 0.1) {
    issues.push({ severity: "medium", message: `${Math.round(cloneRatio * 100)}% of code is duplicated`, tool: "detect_clones", new: false });
  }

  // 7. Knowledge — based on silo ratio and knowledge distribution
  const siloRatio = options.siloRatio ?? 0;
  const avgKnowledge = options.avgKnowledgeScore ?? 1;
  const knowledgeScore = Math.max(0, (1 - siloRatio) * 0.5 + avgKnowledge * 0.5);

  if (siloRatio > 0.3) {
    issues.push({ severity: "high", message: `${Math.round(siloRatio * 100)}% of files are knowledge silos (single author)`, tool: "get_knowledge_map", new: false });
  }

  // 8. Stability — based on recent churn
  const recentChurnRatio = options.recentChurnRatio ?? 0;
  const stabilityScore = Math.max(0, 1 - recentChurnRatio * 2); // 50% files churning = 0

  if (recentChurnRatio > 0.4) {
    issues.push({ severity: "medium", message: `${Math.round(recentChurnRatio * 100)}% of files changed recently (high churn)`, tool: "find_hotspots", new: false });
  }

  // Compute weighted total
  const breakdown: Record<string, CategoryScore> = {
    connectivity: { score: connectivityScore, weight: WEIGHTS.connectivity, trend: "stable" },
    modularity: { score: modNormalized, weight: WEIGHTS.modularity, trend: "stable" },
    freshness: { score: freshnessScore, weight: WEIGHTS.freshness, trend: "stable" },
    testCoverage: { score: testScore, weight: WEIGHTS.testCoverage, trend: "stable" },
    complexity: { score: complexityScore, weight: WEIGHTS.complexity, trend: "stable" },
    duplication: { score: duplicationScore, weight: WEIGHTS.duplication, trend: "stable" },
    knowledge: { score: knowledgeScore, weight: WEIGHTS.knowledge, trend: "stable" },
    stability: { score: stabilityScore, weight: WEIGHTS.stability, trend: "stable" },
  };

  let totalScore = 0;
  for (const [, cat] of Object.entries(breakdown)) {
    totalScore += cat.score * cat.weight;
  }
  totalScore = Math.round(totalScore * 100);

  const grade = totalScore >= 90 ? "A" : totalScore >= 80 ? "B" : totalScore >= 70 ? "C" : totalScore >= 60 ? "D" : "F";

  // Sort issues by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    score: totalScore,
    grade,
    breakdown,
    top_issues: issues.slice(0, 10),
    predictions: [],
  };
}
