import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import {
  createToolContext,
  buildGraph,
  getStats,
  queryDependencies,
  queryDependents,
  detectCyclesHandler,
  findOrphansHandler,
  healthReportHandler,
  getChangeCouplingHandler,
  getKnowledgeMapHandler,
  getChangeRiskHandler,
  checkArchitectureRulesHandler,
} from "./mcp/tools.js";

const repoRoot = process.env.CODE_GRAPH_REPO ?? process.cwd();
const config = loadConfig(repoRoot);
const ctx = createToolContext(config, repoRoot);

const server = new McpServer(
  { name: "code-graph-mcp", version: "0.1.0" },
  { capabilities: { logging: {} } }
);

// --- Core Tools ---

server.tool("ping", "Check if the server is running", {}, async () => {
  return { content: [{ type: "text", text: "pong" }] };
});

server.tool(
  "build_graph",
  "Parse all TypeScript/TSX files and build the code knowledge graph",
  {
    repo_path: z.string().optional().describe("Override repository root path"),
  },
  async ({ repo_path }) => {
    if (repo_path) {
      ctx.repoRoot = repo_path;
    }
    const result = await buildGraph(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_stats",
  "Get graph statistics: node count, edge count, file count, symbol count, community count",
  {},
  async () => {
    const stats = getStats(ctx);
    return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
  }
);

server.tool(
  "query_dependencies",
  "Get what a file/symbol depends on (forward dependencies)",
  {
    node_id: z.string().describe("File path or symbol ID (e.g. 'src/index.ts' or 'src/index.ts::main')"),
    depth: z.number().optional().default(1).describe("Traversal depth (1=direct, 2+=transitive)"),
  },
  async ({ node_id, depth }) => {
    const result = queryDependencies(ctx, node_id, depth);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "query_dependents",
  "Get what depends on a file/symbol (reverse dependencies / impact radius)",
  {
    node_id: z.string().describe("File path or symbol ID"),
    depth: z.number().optional().default(1).describe("Traversal depth (1=direct, 2+=transitive)"),
  },
  async ({ node_id, depth }) => {
    const result = queryDependents(ctx, node_id, depth);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "detect_cycles",
  "Find circular dependency cycles in the codebase using Tarjan's SCC algorithm",
  {},
  async () => {
    const result = detectCyclesHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "find_orphans",
  "Find orphan files (no importers), unused functions, and zombie exports",
  {},
  async () => {
    const result = findOrphansHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "health_report",
  "Generate a comprehensive health report with 8-category scoring (0-100) and letter grade",
  {},
  async () => {
    const report = healthReportHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  }
);

server.tool(
  "check_architecture_rules",
  "Check architecture rules defined in codegraph.config.json — dependency, layer, and boundary rules",
  {},
  async () => {
    const violations = checkArchitectureRulesHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(violations, null, 2) }] };
  }
);

// --- Temporal/Knowledge Tools ---

server.tool(
  "get_change_coupling",
  "Find files that frequently change together (temporal coupling from git history)",
  {},
  async () => {
    const result = await getChangeCouplingHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_knowledge_map",
  "Get developer ownership map, knowledge silos, and bus factor per community",
  {},
  async () => {
    const result = await getKnowledgeMapHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_change_risk",
  "Assess risk score for changing a specific file based on churn, coupling, ownership, and dependencies",
  {
    file_path: z.string().describe("File path to assess risk for"),
  },
  async ({ file_path }) => {
    const result = await getChangeRiskHandler(ctx, file_path);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
