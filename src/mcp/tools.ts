import { GraphBuilder, type BuildResult } from "../graph/builder.js";
import { GraphStore } from "../graph/graph-store.js";
import { findCycles, findOrphans, findHubNodes, findBridgeNodes, getConnectedComponents } from "../graph/analysis.js";
import { detectCommunities, assignCommunities } from "../graph/community.js";
import { computeHealthReport } from "../graph/health.js";
import type { CodeGraphConfig } from "../types.js";

export interface ToolContext {
  store: GraphStore;
  config: CodeGraphConfig;
  repoRoot: string;
  lastBuild: BuildResult | null;
}

export function createToolContext(config: CodeGraphConfig, repoRoot: string): ToolContext {
  return {
    store: new GraphStore(),
    config,
    repoRoot,
    lastBuild: null,
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
