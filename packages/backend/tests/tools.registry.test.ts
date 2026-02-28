import { describe, expect, it } from "bun:test";

import { createSession, resetStores, upsertTeacher } from "../src/store";
import {
  dispatchToolCall,
  toAnthropicToolDefinitions,
  toOpenAIToolDefinitions,
} from "../src/tools/registry";

const teacherId = "22222222-2222-4222-8222-222222222222";

describe("tool registry", () => {
  it("generates provider tool schemas", () => {
    const openAiTools = toOpenAIToolDefinitions();
    const anthropicTools = toAnthropicToolDefinitions();

    expect(openAiTools.length >= 6).toBe(true);
    expect(anthropicTools.length).toBe(openAiTools.length);

    const readSkill = openAiTools.find(
      (tool) =>
        typeof tool === "object" &&
        tool !== null &&
        (tool as { function?: { name?: string } }).function?.name ===
          "read_skill",
    );
    expect(Boolean(readSkill)).toBe(true);
  });

  it("returns tool-not-found errors without throwing", async () => {
    const result = await dispatchToolCall(
      {
        id: "1",
        name: "unknown_tool",
        input: {},
      },
      { teacherId },
    );

    expect(result.isError).toBe(true);
    expect(result.output.includes("Tool not found")).toBe(true);
  });

  it("supports update_tasks add/update/complete", async () => {
    await resetStores();
    await upsertTeacher({
      id: teacherId,
      email: "tool-registry@example.com",
      name: "Tool Registry Teacher",
      passwordHash: "test-hash",
    });
    const session = await createSession({
      teacherId,
      provider: "openai",
      model: "mock-openai",
    });

    const addResult = await dispatchToolCall(
      {
        id: "1",
        name: "update_tasks",
        input: { operation: "add", text: "Draft lesson plan" },
      },
      { teacherId, sessionId: session.id },
    );

    expect(addResult.isError).toBe(false);
    expect(addResult.output.includes("Draft lesson plan")).toBe(true);

    const updateResult = await dispatchToolCall(
      {
        id: "2",
        name: "update_tasks",
        input: {
          operation: "update",
          id: "task-1",
          text: "Draft lesson and quiz",
        },
      },
      { teacherId, sessionId: session.id },
    );

    expect(updateResult.isError).toBe(false);
    expect(updateResult.output.includes("Draft lesson and quiz")).toBe(true);

    const completeResult = await dispatchToolCall(
      {
        id: "3",
        name: "update_tasks",
        input: { operation: "complete", id: "task-1" },
      },
      { teacherId, sessionId: session.id },
    );

    expect(completeResult.isError).toBe(false);
    expect(completeResult.output.includes('"completed": true')).toBe(true);
  });
});
