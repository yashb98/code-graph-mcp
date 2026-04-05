import Graph from "graphology";
import type { GraphNode, EdgeKind } from "../types.js";

export class GraphStore {
  readonly graph: Graph;

  constructor() {
    this.graph = new Graph({ type: "directed", multi: false });
  }

  get nodeCount(): number {
    return this.graph.order;
  }

  get edgeCount(): number {
    return this.graph.size;
  }

  addFileNode(id: string, attrs: Partial<GraphNode> = {}): void {
    if (this.graph.hasNode(id)) {
      this.graph.mergeNodeAttributes(id, { ...attrs, kind: "file" });
    } else {
      this.graph.addNode(id, {
        kind: "file",
        name: id.split("/").pop() ?? id,
        filePath: id,
        line: 0,
        column: 0,
        exported: false,
        deprecated: false,
        hasAnyType: false,
        loc: 0,
        contentHash: "",
        ...attrs,
        id,
      });
    }
  }

  addSymbolNode(id: string, attrs: Omit<GraphNode, "id">): void {
    if (this.graph.hasNode(id)) {
      this.graph.mergeNodeAttributes(id, attrs);
    } else {
      this.graph.addNode(id, { ...attrs, id });
    }
  }

  addEdge(source: string, target: string, kind: EdgeKind, weight: number = 1, typeResolved: boolean = false): void {
    if (!this.graph.hasNode(source) || !this.graph.hasNode(target)) return;
    const edgeKey = `${source}--${kind}-->${target}`;
    if (this.graph.hasEdge(edgeKey)) {
      this.graph.mergeEdgeAttributes(edgeKey, { weight, typeResolved });
    } else {
      this.graph.addEdgeWithKey(edgeKey, source, target, { kind, weight, typeResolved });
    }
  }

  hasEdge(source: string, target: string): boolean {
    return this.graph.hasEdge(source, target);
  }

  getNode(id: string): (GraphNode & { id: string }) | undefined {
    if (!this.graph.hasNode(id)) return undefined;
    return this.graph.getNodeAttributes(id) as GraphNode & { id: string };
  }

  getDependencies(nodeId: string): string[] {
    if (!this.graph.hasNode(nodeId)) return [];
    return this.graph.outNeighbors(nodeId);
  }

  getDependents(nodeId: string): string[] {
    if (!this.graph.hasNode(nodeId)) return [];
    return this.graph.inNeighbors(nodeId);
  }

  getOrphanFiles(entryPoints: Set<string>): string[] {
    const orphans: string[] = [];
    this.graph.forEachNode((node, attrs) => {
      if (attrs.kind !== "file") return;
      if (entryPoints.has(node)) return;
      if (this.graph.inDegree(node) === 0) {
        orphans.push(node);
      }
    });
    return orphans;
  }

  removeFile(filePath: string): void {
    const toRemove: string[] = [];
    this.graph.forEachNode((node, attrs) => {
      if (attrs.filePath === filePath || node === filePath) {
        toRemove.push(node);
      }
    });
    for (const node of toRemove) {
      this.graph.dropNode(node);
    }
  }

  getStats(): { nodeCount: number; edgeCount: number; fileCount: number; symbolCount: number } {
    let fileCount = 0;
    let symbolCount = 0;
    this.graph.forEachNode((_, attrs) => {
      if (attrs.kind === "file") fileCount++;
      else symbolCount++;
    });
    return { nodeCount: this.graph.order, edgeCount: this.graph.size, fileCount, symbolCount };
  }

  getFileNodes(): string[] {
    const files: string[] = [];
    this.graph.forEachNode((node, attrs) => {
      if (attrs.kind === "file") files.push(node);
    });
    return files;
  }

  forEachNode(callback: (id: string, attrs: GraphNode & { id: string }) => void): void {
    this.graph.forEachNode((node, attrs) => {
      callback(node, attrs as GraphNode & { id: string });
    });
  }

  forEachEdge(callback: (edge: string, attrs: any, source: string, target: string) => void): void {
    this.graph.forEachEdge((edge, attrs, source, target) => {
      callback(edge, attrs, source, target);
    });
  }

  clear(): void {
    this.graph.clear();
  }
}
