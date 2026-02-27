import { describe, expect, it } from "bun:test";

import { assertValidProvider, callModel } from "../src/model";

describe("model adapter", () => {
  it("rejects invalid providers", () => {
    expect(() => assertValidProvider("invalid-provider")).toThrow(
      "Unsupported provider",
    );
  });

  it("returns normalized mock response", async () => {
    const response = await callModel("openai", "gpt-4o", [
      { role: "user", content: "Hello" },
    ]);

    expect(response.content.includes("Hello")).toBe(true);
    expect(response.toolCalls).toEqual([]);
    expect(response.usage.totalTokens > 0).toBe(true);
    expect(response.stopReason).toBe("stop");
  });
});
