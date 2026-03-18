/**
 * Entry point for running the MCP server.
 */

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "./server.js";
import { cleanupFoundryLocal } from "./ai.js";

// Rate limiter: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Too many requests, please try again later" },
    id: null,
  },
});

/**
 * Starts an MCP server with Streamable HTTP transport in stateless mode.
 */
export async function startStreamableHTTPServer(
  createServer: () => McpServer,
): Promise<void> {
  // NOTE: Preloading disabled due to Foundry Local SDK resource management issues
  // with concurrent requests. Using on-demand loading instead (same pattern as app-rag.js).
  // This is thread-safe and follows the Foundry Local best practices for HTTP servers.

  const port = parseInt(process.env.PORT ?? "3004", 10);

  const app = createMcpExpressApp({ host: "127.0.0.1" });
  app.use(cors({
    origin: [
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ],
  }));
  app.use("/mcp", limiter);

  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`MCP Markdown Viewer server listening on http://localhost:${port}/mcp`);
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    cleanupFoundryLocal().catch(console.error);
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Starts an MCP server with stdio transport.
 */
export async function startStdioServer(
  createServer: () => McpServer,
): Promise<void> {
  // NOTE: Preloading disabled due to Foundry Local SDK resource management issues.
  // Using on-demand loading instead (same pattern as app-rag.js).
  // This is thread-safe and follows Foundry Local best practices.

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await cleanupFoundryLocal().catch(console.error);
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    console.log("\nShutting down...");
    await cleanupFoundryLocal().catch(console.error);
    process.exit(0);
  });
  await createServer().connect(new StdioServerTransport());
}

async function main() {
  try {
    if (process.argv.includes("--stdio")) {
      console.error("Starting MCP server with stdio transport...");
      await startStdioServer(createServer);
    } else {
      console.error("Starting MCP server with HTTP transport...");
      await startStreamableHTTPServer(createServer);
    }
  } catch (e) {
    console.error("Fatal error:", e);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Uncaught error:", e);
  process.exit(1);
});
