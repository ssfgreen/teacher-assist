import { describe, expect, it } from "bun:test";

import {
  ModelConfigurationError,
  assertValidProvider,
  callModel,
} from "../src/model";

describe("model adapter", () => {
  it("rejects invalid providers", () => {
    expect(() => assertValidProvider("invalid-provider")).toThrow(
      "Unsupported provider",
    );
  });

  it("returns normalized mock response for mock model", async () => {
    const response = await callModel("openai", "mock-openai", [
      { role: "user", content: "Hello" },
    ]);

    expect(response.content.includes("Hello")).toBe(true);
    expect(response.toolCalls).toEqual([]);
    expect(response.usage.totalTokens > 0).toBe(true);
    expect(response.stopReason).toBe("stop");
  });

  it("throws configuration error for real model without API key", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "";

    await expect(callModel("openai", "gpt-4o", [])).rejects.toBeInstanceOf(
      ModelConfigurationError,
    );

    process.env.OPENAI_API_KEY = originalKey;
  });
});
