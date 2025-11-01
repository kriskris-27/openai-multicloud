import { helloToolHandler } from "../src/tools/helloTool.js";

describe("helloTool", () => {
  it("should greet properly", async () => {
    const res = await helloToolHandler({ name: "Kris" });
    expect(res.content[0].text).toContain("Kris");
  });
});
