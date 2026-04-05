import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer(
  { name: "code-graph-mcp", version: "0.1.0" },
  { capabilities: { logging: {} } }
);

server.tool("ping", "Check if the server is running", {}, async () => {
  return { content: [{ type: "text", text: "pong" }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
