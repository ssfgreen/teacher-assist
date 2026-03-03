import { describe, expect, it } from "bun:test";

import { buildTrace } from "./trace-builder";

describe("buildTrace subagent spans", () => {
  it("adds subagent child span metadata for spawn_subagent tool calls", () => {
    const trace = buildTrace({
      sessionId: "s1",
      provider: "openai",
      model: "mock-agentic-subagent-parent",
      systemPrompt: "prompt",
      estimatedPromptTokens: 10,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        estimatedCostUsd: 0.00006,
      },
      memoryContextLoaded: [],
      requestMessages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      agentMessages: [
        {
          role: "tool",
          content: "{}",
          toolName: "spawn_subagent",
          toolInput: { agent: "research-helper", task: "Task" },
          toolMetadata: {
            agent: "research-helper",
            depth: 1,
            maxDepth: 2,
            status: "success",
          },
        },
      ],
      includeCommandHookSpan: false,
    });

    const subagentSpan = trace.spans.find((span) => span.kind === "subagent");
    expect(subagentSpan).toBeDefined();
    expect(subagentSpan?.label).toContain("research-helper");
    expect(subagentSpan?.metadata?.status).toBe("success");
  });
});
