// src/core/server.ts
import { createServer } from "node:http";
import { URL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { registerRoutes } from "./routes.js";
import { checkDatabaseConnection } from "./db.js";
import { prisma } from "./prisma.js";
import { AUTH0_PROVIDER, handleAuthCallback, handleAuthLogin, verifyAuth0Token } from "./auth.js";
import { upsertIdentityUser } from "./userRepository.js";
import { runWithRequestContext } from "./requestContext.js";

const resourceMetadataUrl = new URL("/.well-known/oauth-protected-resource", env.APP_BASE_URL).toString();
const protectedResourceMetadata = JSON.stringify({
  resource: env.OAUTH_RESOURCE_ID ?? env.APP_BASE_URL,
  authorization_servers: [env.OAUTH_AUTHORIZATION_SERVER],
});

function sendProtectedResourceMetadata(res: import("node:http").ServerResponse) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(protectedResourceMetadata);
}

function sendUnauthorized(res: import("node:http").ServerResponse) {
  res.writeHead(401, {
    "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
    "Cache-Control": "no-store",
  });
  res.end();
}

export async function startServer() {
  const server = new McpServer({
    name: env.APP_NAME,
    version: env.APP_VERSION,
  });

  registerRoutes(server);

  await checkDatabaseConnection();
  await prisma.$connect();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && requestUrl.pathname === "/auth/login") {
        await handleAuthLogin(res);
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/auth/callback") {
        await handleAuthCallback(req, res, requestUrl);
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/.well-known/oauth-protected-resource") {
        sendProtectedResourceMetadata(res);
        return;
      }

      const requiresAuth = requestUrl.pathname.startsWith("/mcp");

      if (requiresAuth) {
        const authorizationHeader = req.headers.authorization ?? "";
        const tokenMatch = authorizationHeader.match(/^Bearer\s+(.+)$/i);

        if (!tokenMatch) {
          sendUnauthorized(res);
          return;
        }

        const token = tokenMatch[1]?.trim();

        if (!token) {
          sendUnauthorized(res);
          return;
        }

        try {
          const payload = await verifyAuth0Token(token);
          const user = await upsertIdentityUser(AUTH0_PROVIDER, {
            sub: payload.sub,
            email: payload.email!,
            name: payload.name ?? null,
            picture: payload.picture ?? null,
          });

          await runWithRequestContext({ user }, async () => {
            await transport.handleRequest(req, res);
          });
          return;
        } catch (authError) {
          const message = authError instanceof Error ? authError.message : String(authError);
          logger.warn(`Unauthorized MCP request: ${message}`);
          sendUnauthorized(res);
          return;
        }
      }

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
