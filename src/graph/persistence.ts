import type { GraphStore } from "./graph-store.js";

let kuzu: any = null;

function getKuzu() {
  if (!kuzu) {
    kuzu = require("kuzu");
  }
  return kuzu;
}

function escStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class KuzuPersistence {
  private db: any = null;
  private conn: any = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const kuzu = getKuzu();
    this.db = new kuzu.Database(this.dbPath);
    this.conn = new kuzu.Connection(this.db);

    await this.conn.query(`
      CREATE NODE TABLE IF NOT EXISTS CodeNode(
        id STRING,
        kind STRING,
        name STRING,
        filePath STRING,
        line INT64,
        exported BOOLEAN,
        deprecated BOOLEAN,
        hasAnyType BOOLEAN,
        loc INT64,
        contentHash STRING,
        PRIMARY KEY(id)
      )
    `);

    await this.conn.query(`
      CREATE REL TABLE IF NOT EXISTS CodeEdge(
        FROM CodeNode TO CodeNode,
        kind STRING,
        weight DOUBLE,
        typeResolved BOOLEAN
      )
    `);
  }

  async save(store: GraphStore): Promise<{ nodes: number; edges: number }> {
    if (!this.conn) throw new Error("Not initialized");

    // Clear existing data
    await this.conn.query("MATCH (n:CodeNode) DETACH DELETE n");

    let nodeCount = 0;
    let edgeCount = 0;

    // Collect nodes
    const nodes: any[] = [];
    store.forEachNode((id, attrs) => {
      nodes.push({
        id,
        kind: attrs.kind ?? "file",
        name: attrs.name ?? "",
        filePath: attrs.filePath ?? "",
        line: attrs.line ?? 0,
        exported: attrs.exported ?? false,
        deprecated: attrs.deprecated ?? false,
        hasAnyType: attrs.hasAnyType ?? false,
        loc: attrs.loc ?? 0,
        contentHash: attrs.contentHash ?? "",
      });
    });

    for (const node of nodes) {
      await this.conn.query(
        `CREATE (n:CodeNode {id: '${escStr(node.id)}', kind: '${escStr(node.kind)}', name: '${escStr(node.name)}', filePath: '${escStr(node.filePath)}', line: ${node.line}, exported: ${node.exported}, deprecated: ${node.deprecated}, hasAnyType: ${node.hasAnyType}, loc: ${node.loc}, contentHash: '${escStr(node.contentHash)}'})`
      );
      nodeCount++;
    }

    // Collect and insert edges
    const edges: any[] = [];
    store.forEachEdge((_, attrs, source, target) => {
      edges.push({ source, target, kind: attrs.kind ?? "", weight: attrs.weight ?? 1, typeResolved: attrs.typeResolved ?? false });
    });

    for (const edge of edges) {
      await this.conn.query(
        `MATCH (a:CodeNode {id: '${escStr(edge.source)}'}), (b:CodeNode {id: '${escStr(edge.target)}'}) CREATE (a)-[:CodeEdge {kind: '${escStr(edge.kind)}', weight: ${edge.weight}, typeResolved: ${edge.typeResolved}}]->(b)`
      );
      edgeCount++;
    }

    return { nodes: nodeCount, edges: edgeCount };
  }

  async load(store: GraphStore): Promise<{ nodes: number; edges: number }> {
    if (!this.conn) throw new Error("Not initialized");

    store.clear();

    // Load nodes
    const nodeResult = await this.conn.query("MATCH (n:CodeNode) RETURN n.id, n.kind, n.name, n.filePath, n.line, n.exported, n.deprecated, n.hasAnyType, n.loc, n.contentHash");
    const nodeRows = await nodeResult.getAll();

    for (const row of nodeRows) {
      if (row["n.kind"] === "file") {
        store.addFileNode(row["n.id"], {
          loc: Number(row["n.loc"]) || 0,
          exported: row["n.exported"] ?? false,
          deprecated: row["n.deprecated"] ?? false,
          hasAnyType: row["n.hasAnyType"] ?? false,
          contentHash: row["n.contentHash"] ?? "",
        });
      } else {
        store.addSymbolNode(row["n.id"], {
          kind: row["n.kind"],
          name: row["n.name"],
          filePath: row["n.filePath"],
          line: Number(row["n.line"]) || 0,
          column: 0,
          exported: row["n.exported"] ?? false,
          deprecated: row["n.deprecated"] ?? false,
          hasAnyType: row["n.hasAnyType"] ?? false,
          loc: Number(row["n.loc"]) || 0,
          contentHash: row["n.contentHash"] ?? "",
        });
      }
    }

    // Load edges
    const edgeResult = await this.conn.query("MATCH (a:CodeNode)-[e:CodeEdge]->(b:CodeNode) RETURN a.id, b.id, e.kind, e.weight, e.typeResolved");
    const edgeRows = await edgeResult.getAll();

    for (const row of edgeRows) {
      store.addEdge(
        row["a.id"],
        row["b.id"],
        row["e.kind"],
        Number(row["e.weight"]) || 1,
        row["e.typeResolved"] ?? false
      );
    }

    return { nodes: nodeRows.length, edges: edgeRows.length };
  }

  async close(): Promise<void> {
    try {
      if (this.conn) this.conn.closeSync();
    } catch {}
    try {
      if (this.db) this.db.closeSync();
    } catch {}
    this.conn = null;
    this.db = null;
  }
}
