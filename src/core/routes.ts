// src/core/routes.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHelloTool } from "../tools/helloTool.js";
import { registerSystemTool } from "../tools/systemTool.js";
import { registerHelloWidget } from "../resources/helloWidget.js";

export function registerRoutes(server: McpServer) {
  registerHelloTool(server);
  registerSystemTool(server);
  registerHelloWidget(server);
}
