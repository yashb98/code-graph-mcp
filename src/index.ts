import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { registerResources } from "./mcp/resources.js";
import { registerPrompts } from "./mcp/prompts.js";
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
  searchSymbolsHandler,
  findHotspotsHandler,
  findCodeSmellsHandler,
  getArchitectureOverviewHandler,
  getCommunityHandler,
  getReviewContextHandler,
  planMigrationHandler,
} from "./mcp/tools.js";

const repoRoot = process.env.CODE_GRAPH_REPO ?? process.cwd();
const config = loadConfig(repoRoot);
const ctx = createToolContext(config, repoRoot);

const server = new McpServer(
  { name: "code-graph-mcp", version: "0.1.0" },
  { capabilities: { logging: {}, resources: {}, prompts: {} } }
);

// Register resources and prompts
registerResources(server, ctx);
registerPrompts(server);

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

server.tool(
  "search_symbols",
  "Search for functions, classes, and types by name or meaning. Use embeddings=true for semantic search (slower first time, downloads model).",
  {
    query: z.string().describe("Search query (name, keyword, or natural language description)"),
    top_k: z.number().optional().default(10).describe("Number of results to return"),
    use_embeddings: z.boolean().optional().default(false).describe("Use ML embeddings for semantic search (slower but finds conceptual matches)"),
  },
  async ({ query, top_k, use_embeddings }) => {
    const results = await searchSymbolsHandler(ctx, query, top_k, use_embeddings);
    return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
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

// --- Advanced Tools ---

server.tool(
  "find_hotspots",
  "Find code hotspots — files with high churn AND high connectivity (most risky to change)",
  {},
  async () => {
    const result = await findHotspotsHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "find_code_smells",
  "Detect code smells: god files, circular deps, hub nodes, bridge nodes",
  {},
  async () => {
    const result = findCodeSmellsHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_architecture_overview",
  "High-level architecture overview: communities, cycles, components, hubs",
  {},
  async () => {
    const result = getArchitectureOverviewHandler(ctx);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_community",
  "Get details about a specific community: files, internal/external edges, cohesion",
  {
    community_id: z.number().describe("Community ID from get_architecture_overview"),
  },
  async ({ community_id }) => {
    const result = getCommunityHandler(ctx, community_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_review_context",
  "Get review context for specific files: symbols, dependencies, dependents, impact radius",
  {
    file_paths: z.array(z.string()).describe("List of file paths to get context for"),
  },
  async ({ file_paths }) => {
    const result = getReviewContextHandler(ctx, file_paths);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "plan_migration",
  "Plan migration order for files matching a pattern using topological sort",
  {
    source_pattern: z.string().describe("Glob pattern of files to migrate (e.g. 'src/legacy/**')"),
  },
  async ({ source_pattern }) => {
    const result = planMigrationHandler(ctx, source_pattern);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
