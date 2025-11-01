// src/resources/helloWidget.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const HELLO_WIDGET_URI = "ui://widget/hello-widget.html";

export async function helloWidgetReader() {
  return {
    contents: [
      {
        uri: HELLO_WIDGET_URI,
        mimeType: "text/html",
        text: [
          "<div style=\"font-family:sans-serif;padding:1rem;border:1px solid #ccc;border-radius:8px;\">",
          "  <h2>OpenAI App</h2>",
          "  <p>This widget is rendered inside ChatGPT.</p>",
          "</div>",
        ].join("\n"),
      },
    ],
  };
}

export function registerHelloWidget(server: McpServer) {
  server.resource("hello-widget", HELLO_WIDGET_URI, async () => helloWidgetReader());
}
