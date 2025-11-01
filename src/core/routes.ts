// src/core/routes.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHelloTool } from "../tools/helloTool.js";
import { registerSystemTool } from "../tools/systemTool.js";
import { registerHelloWidget } from "../resources/helloWidget.js";
import { registerPrivateTestTool, registerPublicTestTool } from "../tools/authTestTools.js";

export function registerRoutes(server: McpServer) {
  registerHelloTool(server);
  registerSystemTool(server);
  registerPublicTestTool(server);
  registerPrivateTestTool(server);
  registerHelloWidget(server);
}
