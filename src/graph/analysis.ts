import type { GraphStore } from "./graph-store.js";

/**
 * Tarjan's SCC algorithm — finds strongly connected components (cycles).
 * Returns only components with size > 1 (actual cycles).
 */
export function findCycles(store: GraphStore): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let currentIndex = 0;
  const sccs: string[][] = [];

  function strongConnect(node: string) {
    index.set(node, currentIndex);
    lowlink.set(node, currentIndex);
    currentIndex++;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of store.graph.outNeighbors(node)) {
      if (!index.has(neighbor)) {
        strongConnect(neighbor);
        lowlink.set(node, Math.min(lowlink.get(node)!, lowlink.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        lowlink.set(node, Math.min(lowlink.get(node)!, index.get(neighbor)!));
      }
    }

    if (lowlink.get(node) === index.get(node)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== node);

      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  store.graph.forEachNode((node) => {
    if (!index.has(node)) {
      strongConnect(node);
    }
  });

  return sccs;
}

/**
 * Find connected components (weakly connected).
 */
export function getConnectedComponents(store: GraphStore): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  function bfs(start: string): string[] {
    const component: string[] = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const node = queue.shift()!;
      component.push(node);

      for (const neighbor of [...store.graph.outNeighbors(node), ...store.graph.inNeighbors(node)]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return component;
  }

  store.graph.forEachNode((node) => {
    if (!visited.has(node)) {
      components.push(bfs(node));
    }
  });

  return components;
}

/**
 * Find orphans: files with no importers, functions never called, zombie exports.
 */
export function findOrphans(store: GraphStore, entryPoints: Set<string>): {
  files: string[];
  functions: string[];
  zombieExports: string[];
} {
  const files: string[] = [];
  const functions: string[] = [];
  const zombieExports: string[] = [];

  store.graph.forEachNode((node, attrs) => {
    if (attrs.kind === "file") {
      if (!entryPoints.has(node) && store.graph.inDegree(node) === 0) {
        files.push(node);
      }
    } else if (attrs.kind === "function" || attrs.kind === "component") {
      if (store.graph.inDegree(node) === 0 && !entryPoints.has(attrs.filePath)) {
        functions.push(node);
      }
    }

    // Zombie exports: exported symbols with no external references
    if (attrs.exported && attrs.kind !== "file") {
      const inNeighbors = store.graph.inNeighbors(node);
      const hasExternalRef = inNeighbors.some((n) => {
        const nAttrs = store.graph.getNodeAttributes(n);
        return nAttrs.filePath !== attrs.filePath;
      });
      if (!hasExternalRef) {
        zombieExports.push(node);
      }
    }
  });

  return { files, functions, zombieExports };
}

/**
 * Find hub nodes — nodes with degree significantly above average.
 */
export function findHubNodes(store: GraphStore, multiplier: number = 2): string[] {
  if (store.nodeCount === 0) return [];

  let totalDegree = 0;
  store.graph.forEachNode((node) => {
    totalDegree += store.graph.degree(node);
  });

  const avgDegree = totalDegree / store.nodeCount;
  const threshold = avgDegree * multiplier;

  const hubs: string[] = [];
  store.graph.forEachNode((node) => {
    if (store.graph.degree(node) > threshold) {
      hubs.push(node);
    }
  });

  return hubs;
}

/**
 * Find bridge nodes (articulation points) — nodes whose removal disconnects the graph.
 * Uses DFS with low-link values.
 */
export function findBridgeNodes(store: GraphStore): string[] {
  const fileNodes: string[] = [];
  store.graph.forEachNode((node, attrs) => {
    if (attrs.kind === "file") fileNodes.push(node);
  });

  if (fileNodes.length <= 2) return [];

  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulationPoints = new Set<string>();
  let time = 0;

  function dfs(u: string) {
    let children = 0;
    disc.set(u, time);
    low.set(u, time);
    time++;

    const neighbors = new Set([
      ...store.graph.outNeighbors(u),
      ...store.graph.inNeighbors(u),
    ]);

    for (const v of neighbors) {
      if (store.graph.getNodeAttributes(v).kind !== "file") continue;

      if (!disc.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);

        low.set(u, Math.min(low.get(u)!, low.get(v)!));

        if (parent.get(u) === null && children > 1) {
          articulationPoints.add(u);
        }
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
          articulationPoints.add(u);
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const node of fileNodes) {
    if (!disc.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  }

  return [...articulationPoints];
}

/**
 * Get max call chain depth via BFS from entry points.
 */
export function getCallChainDepths(store: GraphStore, entryPoints: Set<string>, maxDepth: number = 10): Map<string, number> {
  const depths = new Map<string, number>();

  for (const entry of entryPoints) {
    if (!store.graph.hasNode(entry)) continue;

    const queue: Array<[string, number]> = [[entry, 0]];
    const visited = new Set<string>();
    visited.add(entry);

    while (queue.length > 0) {
      const [node, depth] = queue.shift()!;
      const current = depths.get(node);
      if (current === undefined || depth > current) {
        depths.set(node, depth);
      }

      if (depth >= maxDepth) continue;

      for (const neighbor of store.graph.outNeighbors(node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, depth + 1]);
        }
      }
    }
  }

  return depths;
}
