// src/tools/systemTool.ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function systemToolHandler(): Promise<CallToolResult> {
  const content: CallToolResult["content"] = [
    {
      type: "text",
      text: "✅ MCP server operational.",
    },
  ];

  return { content };
}

export function registerSystemTool(server: McpServer) {
  server.registerTool(
    "healthCheck",
    {
      title: "System Health Check",
      description: "Reports the server status.",
    },
    async () => systemToolHandler()
  );
}
