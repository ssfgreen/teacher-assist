import { describe, expect, it } from "bun:test";

import { runAgentLoop } from "../src/agent";

describe("agent loop", () => {
  it("executes read_skill tool chain and returns final assistant response", async () => {
    const result = await runAgentLoop({
      teacherId: "t1",
      provider: "openai",
      model: "mock-agentic-skill",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Create a lesson" },
      ],
    });

    expect(result.status).toBe("success");
    expect(result.messages.some((message) => message.role === "tool")).toBe(
      true,
    );
    expect(result.skillsLoaded.includes("backward-design")).toBe(true);
    expect(result.messages.at(-1)?.role).toBe("assistant");
  });

  it("returns error_max_turns when tool loop does not finish in limit", async () => {
    const result = await runAgentLoop({
      teacherId: "t1",
      provider: "openai",
      model: "mock-agentic-skill",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Create a lesson" },
      ],
      options: { maxTurns: 1 },
    });

    expect(result.status).toBe("error_max_turns");
  });

  it("returns error_max_budget when response budget is exceeded", async () => {
    const result = await runAgentLoop({
      teacherId: "t1",
      provider: "openai",
      model: "mock-openai",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "hello" },
      ],
      options: { maxBudgetUsd: 0 },
    });

    expect(result.status).toBe("error_max_budget");
  });
});
