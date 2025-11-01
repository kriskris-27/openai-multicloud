// src/tools/helloTool.ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const helloToolInputSchema = z.object({
  name: z.string(),
});

export async function helloToolHandler({ name }: z.infer<typeof helloToolInputSchema>): Promise<CallToolResult> {
  const content: CallToolResult["content"] = [
    {
      type: "text",
      text: `👋 Hello ${name}! This response comes from your TypeScript MCP server.`,
    },
  ];

  return { content };
}

export function registerHelloTool(server: McpServer) {
  server.registerTool(
    "sayHello",
    {
      title: "Say Hello",
      description: "Greets the user politely.",
      inputSchema: helloToolInputSchema.shape,
    },
    async (args) => helloToolHandler(args)
  );
}
