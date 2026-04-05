import louvain from "graphology-communities-louvain";
import type { GraphStore } from "./graph-store.js";

export interface CommunityResult {
  communities: Record<string, number>;
  count: number;
  modularity: number;
}

export function detectCommunities(store: GraphStore): CommunityResult {
  if (store.nodeCount === 0) return { communities: {}, count: 0, modularity: 0 };

  // Louvain needs an undirected view; work on file nodes only for meaningful communities
  const Graph = store.graph.constructor as any;
  const undirected = new Graph({ type: "undirected", multi: false });

  store.graph.forEachNode((node, attrs) => {
    if (attrs.kind === "file") {
      undirected.addNode(node, attrs);
    }
  });

  store.graph.forEachEdge((edge, attrs, source, target) => {
    const sourceAttrs = store.graph.getNodeAttributes(source);
    const targetAttrs = store.graph.getNodeAttributes(target);
    if (sourceAttrs.kind === "file" && targetAttrs.kind === "file") {
      if (undirected.hasNode(source) && undirected.hasNode(target) && !undirected.hasEdge(source, target)) {
        undirected.addEdge(source, target);
      }
    }
  });

  if (undirected.size === 0) {
    // No edges — each node is its own community
    const communities: Record<string, number> = {};
    let i = 0;
    undirected.forEachNode((node: string) => {
      communities[node] = i++;
    });
    return { communities, count: i, modularity: 0 };
  }

  const result = louvain.detailed(undirected);
  return {
    communities: result.communities,
    count: result.count,
    modularity: result.modularity,
  };
}

export function assignCommunities(store: GraphStore, communities: Record<string, number>): void {
  for (const [node, community] of Object.entries(communities)) {
    if (store.graph.hasNode(node)) {
      store.graph.mergeNodeAttributes(node, { community });
    }
  }
}
