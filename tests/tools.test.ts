import { jest } from "@jest/globals";

import { helloToolHandler, registerHelloTool } from "../src/tools/helloTool.js";
import { systemToolHandler, registerSystemTool } from "../src/tools/systemTool.js";

describe("helloTool", () => {
  it("should greet properly", async () => {
    const res = await helloToolHandler({ name: "Kris" });
    expect(res.content[0].text).toContain("Kris");
  });

  it("registers sayHello tool with expected metadata and handler", async () => {
    const registerTool = jest.fn();
    const mockServer = { registerTool } as unknown as Parameters<typeof registerHelloTool>[0];

    registerHelloTool(mockServer);

    expect(registerTool).toHaveBeenCalledTimes(1);
    const [toolName, metadata, handler] = registerTool.mock.calls[0];
    expect(toolName).toBe("sayHello");
    expect(metadata).toEqual(
      expect.objectContaining({
        title: "Say Hello",
        description: "Greets the user politely.",
      })
    );
    expect(metadata.inputSchema).toHaveProperty("name");
    await expect(handler({ name: "Test" })).resolves.toEqual(await helloToolHandler({ name: "Test" }));
  });
});

describe("systemTool", () => {
  it("reports server status", async () => {
    const res = await systemToolHandler();
    expect(res.content[0].text).toContain("operational");
  });

  it("registers healthCheck tool with expected handler", async () => {
    const registerTool = jest.fn();
    const mockServer = { registerTool } as unknown as Parameters<typeof registerSystemTool>[0];

    registerSystemTool(mockServer);

    expect(registerTool).toHaveBeenCalledTimes(1);
    const [toolName, metadata, handler] = registerTool.mock.calls[0];
    expect(toolName).toBe("healthCheck");
    expect(metadata).toEqual(
      expect.objectContaining({
        title: "System Health Check",
        description: "Reports the server status.",
      })
    );
    await expect(handler()).resolves.toEqual(await systemToolHandler());
  });
});
