import { describe, expect, it } from "bun:test";

import { runAgentLoop } from "./agent";

describe("runAgentLoop subagents", () => {
  it("completes planner -> subagent -> planner chain and rolls up usage", async () => {
    const result = await runAgentLoop({
      teacherId: "t1",
      sessionId: "s1",
      provider: "openai",
      model: "mock-agentic-subagent-parent",
      messages: [
        { role: "system", content: "You are planner." },
        { role: "user", content: "Plan a loops lesson." },
      ],
    });

    expect(result.status).toBe("success");

    const delegationMessage = result.messages.find(
      (message) =>
        message.role === "tool" && message.toolName === "spawn_subagent",
    );
    expect(delegationMessage).toBeDefined();
    expect(delegationMessage?.toolError).toBe(false);
    expect(delegationMessage?.toolMetadata?.agent).toBe("research-helper");
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(result.usage.estimatedCostUsd).toBeGreaterThan(0);

    const finalAssistant = [...result.messages]
      .reverse()
      .find((message) => message.role === "assistant");
    expect(finalAssistant?.content).toContain("Planner merged subagent output");
  });

  it("enforces delegation depth cap", async () => {
    const result = await runAgentLoop({
      teacherId: "t1",
      sessionId: "s1",
      provider: "openai",
      model: "mock-agentic-subagent-depth",
      messages: [
        { role: "system", content: "You are planner." },
        { role: "user", content: "Try nested delegation." },
      ],
      options: {
        delegation: {
          depth: 0,
          maxDepth: 0,
        },
      },
    });

    expect(result.status).toBe("success");
    const delegationMessage = result.messages.find(
      (message) =>
        message.role === "tool" && message.toolName === "spawn_subagent",
    );
    expect(delegationMessage?.toolError).toBe(true);
    expect(delegationMessage?.content).toContain("depth cap reached");
  });

  it("blocks subagent delegation in child execution contexts", async () => {
    const result = await runAgentLoop({
      teacherId: "t1",
      sessionId: "s1",
      provider: "openai",
      model: "mock-agentic-subagent-depth",
      messages: [
        { role: "system", content: "You are a subagent." },
        { role: "user", content: "Attempt delegation." },
      ],
      options: {
        delegation: {
          enabled: false,
          depth: 1,
          maxDepth: 2,
        },
      },
    });

    expect(result.status).toBe("success");
    const delegationMessage = result.messages.find(
      (message) =>
        message.role === "tool" && message.toolName === "spawn_subagent",
    );
    expect(delegationMessage?.toolError).toBe(true);
    expect(delegationMessage?.content).toContain("delegation is disabled");
  });
});
