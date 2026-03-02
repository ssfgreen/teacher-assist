import { describe, expect, it } from "bun:test";

import { extractSystemPrompt, toInputMessages } from "../src/model/shared";
import type { ChatMessage } from "../src/types";

describe("model shared message adapters", () => {
  const sampleMessages: ChatMessage[] = [
    { role: "system", content: "System instruction A" },
    { role: "system", content: "System instruction B" },
    { role: "user", content: "User asks for lesson plan" },
    { role: "assistant", content: "Let me check." },
    {
      role: "tool",
      toolCallId: "call_123",
      toolName: "read_skill",
      content: "Skill loaded",
    },
  ];

  it("extracts all system messages as a single system prompt", () => {
    expect(extractSystemPrompt(sampleMessages)).toBe(
      "System instruction A\n\nSystem instruction B",
    );
  });

  it("keeps system messages by default when converting to model input", () => {
    const input = toInputMessages(sampleMessages);

    expect(input[0]).toEqual({
      role: "system",
      content: "System instruction A",
    });
    expect(input[1]).toEqual({
      role: "system",
      content: "System instruction B",
    });
  });

  it("can exclude system messages for providers that use top-level system params", () => {
    const input = toInputMessages(sampleMessages, { includeSystem: false });

    expect(input.some((message) => message.role === "system")).toBe(false);
  });

  it("normalizes tool messages into user-visible tool results", () => {
    const input = toInputMessages(sampleMessages);

    expect(input.at(-1)).toEqual({
      role: "user",
      content: "[read_skill result]\nSkill loaded",
    });
  });
});
