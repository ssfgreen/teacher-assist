import { describe, expect, it } from "bun:test";

import { assembleSystemPrompt } from "../src/prompt";

describe("system prompt assembly", () => {
  it("assembles sections in correct order with XML tags", () => {
    const assembled = assembleSystemPrompt({
      assistantIdentity: "identity",
      agentInstructions: "instructions",
      workspaceContext: [
        { path: "teacher.md", content: "teacher context" },
        { path: "classes/3B.md", content: "class context" },
      ],
    });

    const first = assembled.systemPrompt.indexOf("<assistant-identity>");
    const second = assembled.systemPrompt.indexOf("<agent-instructions>");
    const third = assembled.systemPrompt.indexOf("<workspace-context>");

    expect(first >= 0).toBe(true);
    expect(second > first).toBe(true);
    expect(third > second).toBe(true);
    expect(assembled.systemPrompt).toContain("## teacher.md");
    expect(assembled.estimatedTokens > 0).toBe(true);
  });
});
