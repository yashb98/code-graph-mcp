import { describe, test, expect, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { startHttpTransport } from "../../src/transport/http.js";

describe("HTTP Transport", () => {
  let handle: Awaited<ReturnType<typeof startHttpTransport>> | null = null;

  afterEach(() => {
    if (handle) {
      handle.close();
      handle = null;
    }
  });

  test("starts and responds to health check", async () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: {} },
    );
    server.tool("ping", "test", {}, async () => ({
      content: [{ type: "text", text: "pong" }],
    }));

    handle = await startHttpTransport(server, { port: 3199, host: "127.0.0.1" });

    const res = await fetch("http://127.0.0.1:3199/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.sessions).toBe(0);
  });

  test("returns 404 for unknown paths", async () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: {} },
    );

    handle = await startHttpTransport(server, { port: 3198, host: "127.0.0.1" });

    const res = await fetch("http://127.0.0.1:3198/unknown");
    expect(res.status).toBe(404);
  });

  test("MCP endpoint accepts POST", async () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: {} },
    );

    handle = await startHttpTransport(server, { port: 3197, host: "127.0.0.1" });

    // Send an initialize request
    const res = await fetch("http://127.0.0.1:3197/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0" },
        },
      }),
    });
    // Should get a valid response (200 or SSE stream)
    expect([200, 202].includes(res.status) || res.headers.get("content-type")?.includes("text/event-stream")).toBe(true);
  });

  test("stateless mode works", async () => {
    const server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: {} },
    );

    handle = await startHttpTransport(server, { port: 3196, host: "127.0.0.1", stateful: false });

    const res = await fetch("http://127.0.0.1:3196/health");
    expect(res.status).toBe(200);
  });
});
