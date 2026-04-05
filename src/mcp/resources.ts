import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./tools.js";
import { getStats, healthReportHandler } from "./tools.js";

export function registerResources(server: McpServer, ctx: ToolContext): void {
  // Overview resource
  server.resource(
    "overview",
    new ResourceTemplate("codegraph://repo/{name}/overview", { list: undefined }),
    async (uri) => {
      const stats = getStats(ctx);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            repo: ctx.repoRoot,
            ...stats,
          }, null, 2),
        }],
      };
    }
  );

  // Health resource
  server.resource(
    "health",
    new ResourceTemplate("codegraph://repo/{name}/health", { list: undefined }),
    async (uri) => {
      const report = healthReportHandler(ctx);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(report, null, 2),
        }],
      };
    }
  );
}
