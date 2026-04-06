import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./tools.js";
import { getStats, healthReportHandler, findHotspotsHandler, getCommunityHandler, getArchitectureOverviewHandler } from "./tools.js";

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

  // Community resource
  server.resource(
    "community",
    new ResourceTemplate("codegraph://repo/{name}/community/{id}", { list: undefined }),
    async (uri, { id }) => {
      const communityId = parseInt(String(id), 10);
      const result = getCommunityHandler(ctx, communityId);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // Hotspots resource
  server.resource(
    "hotspots",
    new ResourceTemplate("codegraph://repo/{name}/hotspots", { list: undefined }),
    async (uri) => {
      const result = await findHotspotsHandler(ctx);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // Architecture resource
  server.resource(
    "architecture",
    new ResourceTemplate("codegraph://repo/{name}/architecture", { list: undefined }),
    async (uri) => {
      const result = getArchitectureOverviewHandler(ctx);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // Changes resource (recent build info)
  server.resource(
    "changes",
    new ResourceTemplate("codegraph://repo/{name}/changes", { list: undefined }),
    async (uri) => {
      const stats = getStats(ctx);
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            lastBuild: ctx.lastBuild ? {
              filesParsed: ctx.lastBuild.filesParsed,
              timeMs: ctx.lastBuild.timeMs,
              errors: ctx.lastBuild.errors.length,
            } : null,
            ...stats,
          }, null, 2),
        }],
      };
    }
  );
}
