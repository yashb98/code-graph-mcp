# code-graph-mcp

Type-aware code knowledge graph MCP server for TypeScript/TSX projects. Built with OXC parser, graphology, and the MCP SDK.

## Features

- **Structural graph** — OXC-powered parsing of imports, exports, symbols, JSX
- **Community detection** — Louvain algorithm for module clustering
- **Cycle detection** — Tarjan's SCC algorithm
- **Health scoring** — 8-category scoring (0-100) with letter grades
- **Temporal analysis** — Git churn, co-change coupling, bug fix detection
- **Knowledge mapping** — Ownership, bus factor, knowledge silos
- **Architecture rules** — Dependency, layer, and boundary enforcement
- **Merkle indexing** — xxhash-based incremental rebuilds
- **MCP resources** — Live graph overview and health endpoints
- **MCP prompts** — Code review, architecture review, onboarding templates

## 20 MCP Tools

| Tool | Description |
|------|-------------|
| `build_graph` | Parse all TS/TSX files and build the knowledge graph |
| `get_stats` | Node/edge/file/symbol/community counts |
| `query_dependencies` | Forward dependencies with transitive traversal |
| `query_dependents` | Reverse dependencies (impact radius) |
| `detect_cycles` | Circular dependency detection |
| `find_orphans` | Orphan files, unused functions, zombie exports |
| `health_report` | 8-category health scoring with letter grade |
| `check_architecture_rules` | Validate architecture rules from config |
| `search_symbols` | Text or ML-embedding semantic search for symbols |
| `get_change_coupling` | Files that frequently co-change |
| `get_knowledge_map` | Developer ownership, silos, bus factor |
| `get_change_risk` | Risk scoring for a specific file |
| `find_hotspots` | Files with high churn + high connectivity |
| `find_code_smells` | God files, circular deps, hub/bridge nodes |
| `get_architecture_overview` | High-level overview: communities, cycles, hubs |
| `get_community` | Community details: files, edges, cohesion |
| `get_review_context` | Review context for specific files |
| `plan_migration` | Topological migration order for file patterns |
| `detect_clones` | Duplicate code detection via AST body hashing |
| `ping` | Health check |

## Quick Start

```bash
# Install
bun install

# Run MCP server (stdio transport)
bun run src/index.ts

# Run tests
bun test

# Run tests with coverage
bun test --coverage
```

## Verbosity

All tools accept an optional `verbosity` parameter to control response size:

| Level | Behavior | Token Savings |
|-------|----------|---------------|
| `minimal` | Counts/scores only, arrays truncated to 5 items | ~60-80% |
| `normal` | Default behavior | baseline |
| `detailed` | Everything, no truncation | +10-20% |

## Configuration

Create `codegraph.config.json` in your repo root:

```json
{
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist", "**/*.d.ts"],
  "entryPoints": ["src/index.ts"],
  "architectureRules": [
    {
      "id": "no-ui-to-db",
      "name": "UI must not access DB",
      "type": "dependency",
      "rule": { "source": "src/ui/**", "target": "src/db/**", "allow": false },
      "severity": "error"
    }
  ]
}
```

## Claude Code / Cursor Integration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "bun",
      "args": ["run", "/path/to/code-graph-mcp/src/index.ts"],
      "env": {
        "CODE_GRAPH_REPO": "/path/to/your/project"
      }
    }
  }
}
```

## Stack

- **Runtime**: Bun
- **Parser**: OXC NAPI (Rust, fastest TS/TSX parser)
- **Graph**: graphology + Louvain community detection
- **Git**: simple-git for temporal/knowledge analysis
- **Hashing**: xxhash-wasm for Merkle indexing
- **MCP**: @modelcontextprotocol/sdk

## Test Coverage

183 tests | 94.9% line coverage | 94.3% function coverage
