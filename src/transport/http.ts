import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../logger.js";

export interface HttpTransportOptions {
  port?: number;
  host?: string;
  stateful?: boolean;
}

export async function startHttpTransport(server: McpServer, options: HttpTransportOptions = {}) {
  const { port = 3100, host = "127.0.0.1", stateful = true } = options;

  // Map session ID -> transport for stateful mode
  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>();

  function createTransport(): WebStandardStreamableHTTPServerTransport {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: stateful ? () => crypto.randomUUID() : undefined,
      onsessioninitialized: (sessionId) => {
        logger.info("HTTP session initialized", { sessionId });
        sessions.set(sessionId, transport);
      },
      onsessionclosed: (sessionId) => {
        logger.info("HTTP session closed", { sessionId });
        sessions.delete(sessionId);
      },
    });
    return transport;
  }

  const httpServer = Bun.serve({
    port,
    hostname: host,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok", sessions: sessions.size }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // MCP endpoint
      if (url.pathname === "/mcp") {
        // For stateful mode, route to existing session or create new one
        const sessionId = req.headers.get("mcp-session-id");

        if (sessionId && sessions.has(sessionId)) {
          return sessions.get(sessionId)!.handleRequest(req);
        }

        // New session — create transport and connect
        if (req.method === "POST" || req.method === "GET") {
          const transport = createTransport();
          await server.connect(transport);
          return transport.handleRequest(req);
        }

        return new Response("Method not allowed", { status: 405 });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  logger.info("HTTP transport started", { port, host, stateful });

  return {
    server: httpServer,
    close() {
      httpServer.stop();
      for (const transport of sessions.values()) {
        transport.close();
      }
      sessions.clear();
    },
  };
}
