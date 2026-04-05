import type { GraphStore } from "../graph/graph-store.js";

export interface SearchResult {
  id: string;
  name: string;
  filePath: string;
  kind: string;
  score: number;
}

export class SemanticIndex {
  private embeddings: Map<string, Float32Array> = new Map();
  private metadata: Map<string, { name: string; filePath: string; kind: string }> = new Map();
  private pipeline: any = null;
  private modelName: string;
  private ready: boolean = false;

  constructor(modelName: string = "Xenova/all-MiniLM-L6-v2") {
    this.modelName = modelName;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = true;
    env.useBrowserCache = false;
    this.pipeline = await pipeline("feature-extraction", this.modelName, { dtype: "q8" } as any);
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  async indexGraph(store: GraphStore): Promise<number> {
    if (!this.ready) throw new Error("SemanticIndex not initialized. Call init() first.");

    this.embeddings.clear();
    this.metadata.clear();

    const symbols: Array<{ id: string; name: string; filePath: string; kind: string }> = [];
    store.forEachNode((id, attrs) => {
      if (attrs.kind !== "file") {
        symbols.push({ id, name: attrs.name, filePath: attrs.filePath, kind: attrs.kind });
      }
    });

    // Batch embed
    const batchSize = 32;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const texts = batch.map((s) => `${s.kind} ${s.name} in ${s.filePath}`);

      const outputs = await this.pipeline(texts, { pooling: "mean", normalize: true });

      for (let j = 0; j < batch.length; j++) {
        const sym = batch[j];
        const embedding = outputs[j]?.data ?? outputs.data;
        this.embeddings.set(sym.id, new Float32Array(embedding));
        this.metadata.set(sym.id, { name: sym.name, filePath: sym.filePath, kind: sym.kind });
      }
    }

    return symbols.length;
  }

  async search(query: string, topK: number = 10): Promise<SearchResult[]> {
    if (!this.ready) throw new Error("SemanticIndex not initialized. Call init() first.");
    if (this.embeddings.size === 0) return [];

    const queryOutput = await this.pipeline(query, { pooling: "mean", normalize: true });
    const queryEmbedding = new Float32Array(queryOutput.data);

    const scores: Array<{ id: string; score: number }> = [];

    for (const [id, embedding] of this.embeddings) {
      const score = dotProduct(queryEmbedding, embedding);
      scores.push({ id, score });
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, topK).map((s) => {
      const meta = this.metadata.get(s.id)!;
      return {
        id: s.id,
        name: meta.name,
        filePath: meta.filePath,
        kind: meta.kind,
        score: Math.round(s.score * 1000) / 1000,
      };
    });
  }

  /**
   * Simple text-based search fallback (no model needed).
   * Useful when the embedding model isn't loaded.
   */
  textSearch(store: GraphStore, query: string, topK: number = 10): SearchResult[] {
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    store.forEachNode((id, attrs) => {
      if (attrs.kind === "file") return;

      const name = attrs.name.toLowerCase();
      const filePath = attrs.filePath.toLowerCase();

      let score = 0;
      if (name === queryLower) score = 1.0;
      else if (name.includes(queryLower)) score = 0.8;
      else if (filePath.includes(queryLower)) score = 0.5;
      else if (name.includes(queryLower.split(/(?=[A-Z])/).join("").toLowerCase())) score = 0.3;

      if (score > 0) {
        results.push({
          id,
          name: attrs.name,
          filePath: attrs.filePath,
          kind: attrs.kind,
          score,
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  get size(): number {
    return this.embeddings.size;
  }

  clear(): void {
    this.embeddings.clear();
    this.metadata.clear();
  }
}

function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
