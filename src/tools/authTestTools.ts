// src/tools/authTestTools.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../config/logger.js";
import { getCurrentRequestContext } from "../core/requestContext.js";

export function registerPublicTestTool(server: McpServer) {
  server.registerTool(
    "publicTest",
    {
      title: "Public Test Tool",
      description: "Simple tool that is accessible without authentication.",
    },
    async () => ({
      content: [{ type: "text", text: "Public tool invoked successfully." }],
    })
  );
}

export function registerPrivateTestTool(server: McpServer) {
  server.registerTool(
    "privateTest",
    {
      title: "Protected Test Tool",
      description: "Requires a valid Google ID token via Authorization header.",
    },
    async () => {
      const context = getCurrentRequestContext();

      if (!context?.user) {
        logger.warn("Private test tool invoked without authenticated context.");
        throw new Error("Unauthorized");
      }

      return {
        content: [
          {
            type: "text",
            text: `Private tool executed for ${context.user.email}.`,
          },
        ],
      };
    }
  );
}
