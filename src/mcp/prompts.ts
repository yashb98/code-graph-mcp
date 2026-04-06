import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.prompt(
    "code-review",
    "Generate a code review checklist for recent changes",
    { files: z.string().optional().describe("Comma-separated list of changed files") },
    async ({ files }) => {
      const fileList = files ? files.split(",").map((f) => f.trim()) : [];
      const fileSection = fileList.length > 0
        ? `\nChanged files:\n${fileList.map((f) => `- ${f}`).join("\n")}`
        : "\n(No specific files provided — review the most recent changes)";

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `You are reviewing code changes in this repository. Use the code-graph-mcp tools to analyze the impact.

Steps:
1. Run \`build_graph\` if the graph is not yet built
2. For each changed file, run \`query_dependents\` to understand blast radius
3. Run \`detect_cycles\` to check if changes introduced circular dependencies
4. Run \`get_change_risk\` for each file to assess risk
5. Run \`health_report\` to check overall health impact
6. Run \`check_architecture_rules\` to verify no rules are violated
${fileSection}

Provide a structured review with:
- Impact summary (which files/modules are affected)
- Risk assessment (high/medium/low per file)
- Specific concerns or suggestions
- Architecture rule violations (if any)`,
          },
        }],
      };
    }
  );

  server.prompt(
    "architecture-review",
    "Analyze the codebase architecture and suggest improvements",
    {},
    async () => {
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Analyze this codebase's architecture using code-graph-mcp tools.

Steps:
1. Run \`build_graph\` to build the knowledge graph
2. Run \`get_stats\` to understand scale
3. Run \`health_report\` for overall health
4. Run \`detect_cycles\` to find circular dependencies
5. Run \`find_orphans\` to find dead code
6. Run \`check_architecture_rules\` for rule violations
7. Run \`get_change_coupling\` to find tightly coupled files
8. Run \`get_knowledge_map\` to find knowledge silos

Provide:
- Architecture overview (modules, layers, key dependencies)
- Top 5 structural concerns
- Knowledge distribution risks (bus factor, silos)
- Specific, actionable recommendations`,
          },
        }],
      };
    }
  );

  server.prompt(
    "migration-plan",
    "Plan a migration for files matching a pattern",
    { source_pattern: z.string().describe("Glob pattern of files to migrate (e.g., 'src/legacy/**')") },
    async ({ source_pattern }) => {
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Plan a migration for files matching pattern: ${source_pattern}

Steps:
1. Run \`build_graph\` to build the knowledge graph
2. Run \`plan_migration\` with source_pattern="${source_pattern}" to get topological migration order
3. For each phase, run \`get_review_context\` to understand impact
4. Run \`get_change_risk\` for the highest-impact files
5. Run \`get_knowledge_map\` to identify who should own each migration phase
6. Run \`find_tests_for\` on key files to check test coverage

Provide:
- Phase-by-phase migration order (leaf files first)
- Risk assessment per phase
- Suggested PR groupings (which files to bundle)
- Test coverage gaps to address before migration
- Recommended reviewers per phase (based on ownership)`,
          },
        }],
      };
    }
  );

  server.prompt(
    "risk-assessment",
    "Assess risk for a set of changed files before merge",
    { files: z.string().describe("Comma-separated list of changed files") },
    async ({ files }) => {
      const fileList = files.split(",").map(f => f.trim());
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Assess the risk of merging changes to these files:
${fileList.map(f => `- ${f}`).join("\n")}

Steps:
1. Run \`build_graph\` if not yet built
2. Run \`get_change_risk\` for each file
3. Run \`get_impact_radius\` for each file to see blast radius
4. Run \`semantic_diff\` with the changed files to find new cycles and rule violations
5. Run \`find_tests_for\` for each file to check test coverage
6. Run \`get_symbol_info\` for key symbols in changed files
7. Run \`get_knowledge_map\` to check if changes touch knowledge silos

Provide:
- Overall risk score (high/medium/low)
- Per-file risk breakdown with justification
- Blast radius: which modules and teams are affected
- Test coverage: are the changes adequately tested?
- Knowledge risk: are changes in silo areas?
- Recommended actions before merge`,
          },
        }],
      };
    }
  );

  server.prompt(
    "onboarding",
    "Generate an onboarding guide for a new developer",
    { focus_area: z.string().optional().describe("Specific area to focus on (e.g., 'auth', 'api')") },
    async ({ focus_area }) => {
      const focusSection = focus_area
        ? `\nFocus area: ${focus_area} — prioritize files and modules related to this area.`
        : "";

      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `Create an onboarding guide for a new developer joining this project.

Steps:
1. Run \`build_graph\` to build the knowledge graph
2. Run \`get_stats\` to understand codebase scale
3. Run \`health_report\` for a health snapshot
4. Run \`get_knowledge_map\` to identify who knows what
${focusSection}

Generate a guide that covers:
- Project structure overview (key directories, entry points)
- Core modules and their responsibilities
- Key dependencies between modules
- Who to ask about what (based on ownership data)
- Known technical debt or areas needing improvement
- Getting started: which files to read first`,
          },
        }],
      };
    }
  );
}
