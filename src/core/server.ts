// src/core/server.ts
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { registerRoutes } from "./routes.js";

export async function startServer() {
  const server = new McpServer({
    name: env.APP_NAME,
    version: env.APP_VERSION,
  });

  registerRoutes(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    try {
      await transport.handleRequest(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to handle request: ${message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      } else {
        res.end();
      }
    }
  });

  const port = Number(env.PORT);
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));

  logger.info(`🚀 ${env.APP_NAME} v${env.APP_VERSION} running on port ${port}`);

  return { server, transport, httpServer };
}
