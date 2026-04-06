import { GraphBuilder, type BuildResult } from "../graph/builder.js";
import { GraphStore } from "../graph/graph-store.js";
import { findCycles, findOrphans, findHubNodes, findBridgeNodes, getConnectedComponents } from "../graph/analysis.js";
import { detectCommunities, assignCommunities } from "../graph/community.js";
import { computeHealthReport } from "../graph/health.js";
import { checkRules } from "../graph/rules.js";
import { SemanticIndex } from "../search/semantic.js";
import { GitAnalyzer } from "../temporal/git-analyzer.js";
import { computeOwnership } from "../knowledge/ownership.js";
import { computeBusFactor } from "../knowledge/bus-factor.js";
import type { CodeGraphConfig } from "../types.js";

export interface ToolContext {
  store: GraphStore;
  config: CodeGraphConfig;
  repoRoot: string;
  lastBuild: BuildResult | null;
  semanticIndex: SemanticIndex;
}

export function createToolContext(config: CodeGraphConfig, repoRoot: string): ToolContext {
  return {
    store: new GraphStore(),
    config,
    repoRoot,
    lastBuild: null,
    semanticIndex: new SemanticIndex(config.embeddingModel),
  };
}

export async function buildGraph(ctx: ToolContext): Promise<{
  filesParsed: number;
  nodeCount: number;
  edgeCount: number;
  timeMs: number;
  errors: Array<{ file: string; error: string }>;
}> {
  const builder = new GraphBuilder(ctx.repoRoot, {
    include: ctx.config.include,
    exclude: ctx.config.exclude,
    maxFileSize: ctx.config.maxFileSize,
  });

  ctx.store.clear();
  const result = await builder.build(ctx.store);
  ctx.lastBuild = result;

  // Run community detection
  const communities = detectCommunities(ctx.store);
  assignCommunities(ctx.store, communities.communities);

  const stats = ctx.store.getStats();
  return {
    filesParsed: result.filesParsed,
    nodeCount: stats.nodeCount,
    edgeCount: stats.edgeCount,
    timeMs: Math.round(result.timeMs),
    errors: result.errors,
  };
}

export function getStats(ctx: ToolContext): {
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
  symbolCount: number;
  communities: number;
  built: boolean;
} {
  const stats = ctx.store.getStats();
  const communities = detectCommunities(ctx.store);
  return {
    ...stats,
    communities: communities.count,
    built: ctx.lastBuild !== null,
  };
}

export function queryDependencies(ctx: ToolContext, nodeId: string, depth: number = 1): {
  node: string;
  dependencies: string[];
  transitive?: string[];
} {
  const direct = ctx.store.getDependencies(nodeId);

  if (depth <= 1) {
    return { node: nodeId, dependencies: direct };
  }

  const visited = new Set<string>(direct);
  const queue = [...direct];
  const transitive: string[] = [];

  let currentDepth = 1;
  let levelSize = queue.length;

  while (queue.length > 0 && currentDepth < depth) {
    const node = queue.shift()!;
    levelSize--;

    for (const dep of ctx.store.getDependencies(node)) {
      if (!visited.has(dep) && dep !== nodeId) {
        visited.add(dep);
        transitive.push(dep);
        queue.push(dep);
      }
    }

    if (levelSize === 0) {
      currentDepth++;
      levelSize = queue.length;
    }
  }

  return { node: nodeId, dependencies: direct, transitive };
}

export function queryDependents(ctx: ToolContext, nodeId: string, depth: number = 1): {
  node: string;
  dependents: string[];
  transitive?: string[];
} {
  const direct = ctx.store.getDependents(nodeId);

  if (depth <= 1) {
    return { node: nodeId, dependents: direct };
  }

  const visited = new Set<string>(direct);
  const queue = [...direct];
  const transitive: string[] = [];

  let currentDepth = 1;
  let levelSize = queue.length;

  while (queue.length > 0 && currentDepth < depth) {
    const node = queue.shift()!;
    levelSize--;

    for (const dep of ctx.store.getDependents(node)) {
      if (!visited.has(dep) && dep !== nodeId) {
        visited.add(dep);
        transitive.push(dep);
        queue.push(dep);
      }
    }

    if (levelSize === 0) {
      currentDepth++;
      levelSize = queue.length;
    }
  }

  return { node: nodeId, dependents: direct, transitive };
}

export function detectCyclesHandler(ctx: ToolContext): {
  cycles: string[][];
  count: number;
} {
  const cycles = findCycles(ctx.store);
  return { cycles, count: cycles.length };
}

export function findOrphansHandler(ctx: ToolContext): {
  files: string[];
  functions: string[];
  zombieExports: string[];
} {
  const entryPoints = new Set(ctx.config.entryPoints);
  return findOrphans(ctx.store, entryPoints);
}

export function healthReportHandler(ctx: ToolContext) {
  return computeHealthReport(ctx.store, {
    entryPoints: new Set(ctx.config.entryPoints),
    maxCallChainDepth: ctx.config.maxCallChainDepth,
    hubDegreeMultiplier: ctx.config.hubDegreeMultiplier,
  });
}

export function checkArchitectureRulesHandler(ctx: ToolContext) {
  return checkRules(ctx.store, ctx.config.architectureRules);
}

export async function searchSymbolsHandler(ctx: ToolContext, query: string, topK: number = 10, useEmbeddings: boolean = false) {
  if (useEmbeddings) {
    if (!ctx.semanticIndex.isReady()) {
      await ctx.semanticIndex.init();
      await ctx.semanticIndex.indexGraph(ctx.store);
    }
    return ctx.semanticIndex.search(query, topK);
  }
  // Fast text-based fallback
  return ctx.semanticIndex.textSearch(ctx.store, query, topK);
}

// --- Temporal/Knowledge Handlers ---

export async function getChangeCouplingHandler(ctx: ToolContext) {
  const analyzer = new GitAnalyzer(ctx.repoRoot);
  if (!(await analyzer.isGitRepo())) {
    return { error: "Not a git repository", coChanges: [] };
  }

  const coChanges = await analyzer.getCoChanges(
    ctx.config.temporal.lookbackDays,
    1, // low threshold to return more results
  );

  return { coChanges, lookbackDays: ctx.config.temporal.lookbackDays };
}

export async function getKnowledgeMapHandler(ctx: ToolContext) {
  const analyzer = new GitAnalyzer(ctx.repoRoot);
  if (!(await analyzer.isGitRepo())) {
    return { error: "Not a git repository", files: [] };
  }

  const files = ctx.store.getFileNodes();
  const ownershipResults = [];

  for (const filePath of files) {
    const authorData = await analyzer.getFileAuthors(filePath);
    if (authorData) {
      const ownership = computeOwnership(authorData, ctx.config.knowledge.siloThreshold);
      ownershipResults.push(ownership);
    }
  }

  // Compute bus factors per community
  const communities = detectCommunities(ctx.store);
  const communityFiles = new Map<number, typeof ownershipResults>();
  for (const ownership of ownershipResults) {
    const communityId = communities.communities[ownership.filePath];
    if (communityId !== undefined) {
      const files = communityFiles.get(communityId) ?? [];
      files.push(ownership);
      communityFiles.set(communityId, files);
    }
  }

  const busFactors = [];
  for (const [communityId, files] of communityFiles) {
    busFactors.push(computeBusFactor(communityId, files, ctx.config.knowledge.minBusFactor));
  }

  const silos = ownershipResults.filter((o) => o.isSilo);

  return {
    totalFiles: files.length,
    analyzedFiles: ownershipResults.length,
    siloCount: silos.length,
    silos: silos.map((s) => ({ file: s.filePath, author: s.primaryAuthor, score: s.knowledgeScore })),
    busFactors,
  };
}

export async function getChangeRiskHandler(ctx: ToolContext, filePath: string) {
  const analyzer = new GitAnalyzer(ctx.repoRoot);
  if (!(await analyzer.isGitRepo())) {
    return { error: "Not a git repository", filePath, risk: "unknown" };
  }

  // Gather risk signals
  const churn = await analyzer.getFileChurn(ctx.config.temporal.lookbackDays);
  const fileChurn = churn.find((c) => c.filePath === filePath);
  const coChanges = await analyzer.getCoChanges(ctx.config.temporal.lookbackDays, 1);
  const fileCoupling = coChanges.filter((c) => c.fileA === filePath || c.fileB === filePath);

  const dependents = ctx.store.getDependents(filePath);
  const dependencies = ctx.store.getDependencies(filePath);

  const authorData = await analyzer.getFileAuthors(filePath);
  const ownership = authorData ? computeOwnership(authorData, ctx.config.knowledge.siloThreshold) : null;

  // Compute risk score (0-100)
  let riskScore = 0;

  // High churn = higher risk
  if (fileChurn) {
    const maxChurn = Math.max(...churn.map((c) => c.commits));
    riskScore += (fileChurn.commits / maxChurn) * 25;
  }

  // Many dependents = higher blast radius
  riskScore += Math.min(dependents.length * 3, 25);

  // High coupling = changes ripple
  riskScore += Math.min(fileCoupling.length * 5, 25);

  // Knowledge silo = risky
  if (ownership?.isSilo) riskScore += 15;
  if (ownership && ownership.authorCount === 1) riskScore += 10;

  riskScore = Math.min(100, Math.round(riskScore));

  const risk = riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";

  return {
    filePath,
    riskScore,
    risk,
    signals: {
      churn: fileChurn ?? null,
      dependentCount: dependents.length,
      dependencyCount: dependencies.length,
      coupledFiles: fileCoupling.length,
      ownership: ownership ? {
        primaryAuthor: ownership.primaryAuthor,
        authorCount: ownership.authorCount,
        isSilo: ownership.isSilo,
        knowledgeScore: ownership.knowledgeScore,
      } : null,
    },
  };
}

// --- Advanced Tool Handlers ---

export async function findHotspotsHandler(ctx: ToolContext) {
  const analyzer = new GitAnalyzer(ctx.repoRoot);
  if (!(await analyzer.isGitRepo())) {
    return { error: "Not a git repository", hotspots: [] };
  }

  const churn = await analyzer.getFileChurn(ctx.config.temporal.lookbackDays);

  // Combine churn with graph complexity
  const hotspots = churn.slice(0, 20).map((c) => {
    const dependents = ctx.store.getDependents(c.filePath);
    const dependencies = ctx.store.getDependencies(c.filePath);
    return {
      filePath: c.filePath,
      commits: c.commits,
      additions: c.additions,
      deletions: c.deletions,
      churnScore: c.commits * (c.additions + c.deletions),
      dependentCount: dependents.length,
      dependencyCount: dependencies.length,
      complexityScore: c.commits * (dependents.length + 1),
    };
  });

  hotspots.sort((a, b) => b.complexityScore - a.complexityScore);
  return { hotspots, lookbackDays: ctx.config.temporal.lookbackDays };
}

export function findCodeSmellsHandler(ctx: ToolContext) {
  const smells: Array<{ type: string; severity: string; file: string; message: string }> = [];

  // God files (too many exports)
  ctx.store.forEachNode((id, attrs) => {
    if (attrs.kind === "file") {
      let exportCount = 0;
      ctx.store.graph.forEachNode((symId, symAttrs) => {
        if (symAttrs.filePath === id && symAttrs.exported) exportCount++;
      });
      if (exportCount > ctx.config.godFileExportThreshold) {
        smells.push({
          type: "god_file",
          severity: "high",
          file: id,
          message: `${id} exports ${exportCount} symbols (threshold: ${ctx.config.godFileExportThreshold})`,
        });
      }
    }
  });

  // Circular dependencies
  const cycles = findCycles(ctx.store);
  for (const cycle of cycles) {
    smells.push({
      type: "circular_dependency",
      severity: "high",
      file: cycle[0],
      message: `Circular dependency: ${cycle.join(" → ")} → ${cycle[0]}`,
    });
  }

  // Hub nodes
  const hubs = findHubNodes(ctx.store, ctx.config.hubDegreeMultiplier);
  for (const hub of hubs) {
    smells.push({
      type: "hub_node",
      severity: "medium",
      file: hub,
      message: `${hub} is a hub node with high connectivity`,
    });
  }

  // Bridge nodes
  const bridges = findBridgeNodes(ctx.store);
  for (const bridge of bridges) {
    smells.push({
      type: "bridge_node",
      severity: "medium",
      file: bridge,
      message: `${bridge} is a single point of failure (articulation point)`,
    });
  }

  return { smells, count: smells.length };
}

export function getArchitectureOverviewHandler(ctx: ToolContext) {
  const stats = ctx.store.getStats();
  const communities = detectCommunities(ctx.store);
  const cycles = findCycles(ctx.store);
  const components = getConnectedComponents(ctx.store);
  const hubs = findHubNodes(ctx.store, ctx.config.hubDegreeMultiplier);

  // Build community summary
  const communityMap = new Map<number, string[]>();
  for (const [node, community] of Object.entries(communities.communities)) {
    const files = communityMap.get(community) ?? [];
    files.push(node);
    communityMap.set(community, files);
  }

  const communitySummaries = [...communityMap.entries()].map(([id, files]) => ({
    id,
    fileCount: files.length,
    files: files.slice(0, 10), // Top 10 files
    hasMore: files.length > 10,
  }));

  return {
    stats,
    communities: {
      count: communities.count,
      modularity: Math.round(communities.modularity * 1000) / 1000,
      details: communitySummaries,
    },
    cycles: { count: cycles.length, cycles: cycles.slice(0, 5) },
    components: { count: components.length },
    hubs,
    entryPoints: ctx.config.entryPoints,
  };
}

export function getCommunityHandler(ctx: ToolContext, communityId: number) {
  const communities = detectCommunities(ctx.store);

  const files: string[] = [];
  for (const [node, id] of Object.entries(communities.communities)) {
    if (id === communityId) files.push(node);
  }

  if (files.length === 0) {
    return { error: `Community ${communityId} not found`, communityId };
  }

  // Internal vs external edges
  const fileSet = new Set(files);
  let internalEdges = 0;
  let externalEdges = 0;

  for (const file of files) {
    for (const dep of ctx.store.getDependencies(file)) {
      if (fileSet.has(dep)) internalEdges++;
      else externalEdges++;
    }
  }

  return {
    communityId,
    fileCount: files.length,
    files,
    internalEdges,
    externalEdges,
    cohesion: internalEdges + externalEdges > 0
      ? Math.round((internalEdges / (internalEdges + externalEdges)) * 100) / 100
      : 1,
  };
}

export function getReviewContextHandler(ctx: ToolContext, filePaths: string[]) {
  const context = filePaths.map((filePath) => {
    const node = ctx.store.getNode(filePath);
    const deps = ctx.store.getDependencies(filePath);
    const dependents = ctx.store.getDependents(filePath);

    // Get symbols in this file
    const symbols: Array<{ id: string; name: string; kind: string; exported: boolean }> = [];
    ctx.store.forEachNode((id, attrs) => {
      if (attrs.filePath === filePath && attrs.kind !== "file") {
        symbols.push({ id, name: attrs.name, kind: attrs.kind, exported: attrs.exported });
      }
    });

    return {
      filePath,
      exists: !!node,
      loc: node?.loc ?? 0,
      symbols,
      dependencies: deps,
      dependents,
      impactRadius: dependents.length,
    };
  });

  return { files: context, totalImpactRadius: context.reduce((sum, c) => sum + c.impactRadius, 0) };
}

export function planMigrationHandler(ctx: ToolContext, sourcePattern: string) {
  // Find files matching the pattern
  const { Glob } = require("bun") as typeof import("bun");
  const glob = new Glob(sourcePattern);

  const targetFiles: string[] = [];
  ctx.store.forEachNode((id, attrs) => {
    if (attrs.kind === "file" && glob.match(id)) {
      targetFiles.push(id);
    }
  });

  if (targetFiles.length === 0) {
    return { error: `No files match pattern: ${sourcePattern}`, phases: [] };
  }

  // Topological sort — files with no dependents from within the set come first
  const targetSet = new Set(targetFiles);
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const file of targetFiles) {
    inDegree.set(file, 0);
    adjList.set(file, []);
  }

  for (const file of targetFiles) {
    for (const dep of ctx.store.getDependencies(file)) {
      if (targetSet.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
        adjList.get(file)!.push(dep);
      }
    }
  }

  // Kahn's algorithm for topological ordering in phases
  const phases: string[][] = [];
  const remaining = new Set(targetFiles);

  while (remaining.size > 0) {
    const phase: string[] = [];
    for (const file of remaining) {
      if ((inDegree.get(file) ?? 0) === 0) {
        phase.push(file);
      }
    }

    if (phase.length === 0) {
      // Cycle — pick remaining files as final phase
      phases.push([...remaining]);
      break;
    }

    for (const file of phase) {
      remaining.delete(file);
      for (const dep of adjList.get(file) ?? []) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) - 1);
      }
    }

    phases.push(phase);
  }

  return {
    pattern: sourcePattern,
    totalFiles: targetFiles.length,
    phases: phases.map((files, i) => ({
      phase: i + 1,
      files,
      description: i === 0 ? "Leaf files (no internal dependents)" : `Files depending on phase ${i}`,
    })),
  };
}
