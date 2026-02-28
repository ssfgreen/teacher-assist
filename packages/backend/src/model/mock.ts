import type { ChatMessage, ModelResponse, Provider, ToolCall } from "../types";
import { normalize } from "./shared";

export function isMockModel(model: string): boolean {
  return model === "mock" || model.startsWith("mock-");
}

export function chunkText(content: string): string[] {
  const parts = content.match(/\S+\s*/g);
  return parts ?? [content];
}

function latestUserMessage(messages: ChatMessage[]): string {
  return (
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? ""
  );
}

export function mockResponse(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
): ModelResponse {
  if (model === "mock-agentic-skill") {
    const toolCalls: ToolCall[] = [];
    const loadedTier2 = messages.some(
      (message) =>
        message.role === "tool" &&
        message.toolName === "read_skill" &&
        message.content.includes("Tier: 2"),
    );
    const loadedTier3 = messages.some(
      (message) =>
        message.role === "tool" &&
        message.toolName === "read_skill" &&
        message.content.includes("Tier: 3"),
    );

    if (!loadedTier2) {
      toolCalls.push({
        id: "mock-call-1",
        name: "read_skill",
        input: { target: "backward-design" },
      });
      return {
        ...normalize("", messages),
        toolCalls,
        stopReason: "tool_use",
      };
    }

    if (!loadedTier3) {
      toolCalls.push({
        id: "mock-call-2",
        name: "read_skill",
        input: { target: "backward-design/examples.md" },
      });
      return {
        ...normalize("", messages),
        toolCalls,
        stopReason: "tool_use",
      };
    }

    return normalize(
      "Lesson draft ready with backward design outcomes, evidence, and sequence.",
      messages,
    );
  }

  if (model === "mock-agentic-write") {
    const wroteFile = messages.some(
      (message) =>
        message.role === "tool" &&
        message.toolName === "write_file" &&
        message.content.includes("Wrote"),
    );

    if (!wroteFile) {
      return {
        ...normalize("", messages),
        toolCalls: [
          {
            id: "mock-call-write-1",
            name: "write_file",
            input: {
              path: "outputs/lesson-plan.md",
              content:
                "# Draft Lesson Plan\n\n## Starter\nQuick retrieval check.\n",
            },
          },
        ],
        stopReason: "tool_use",
      };
    }

    return normalize(
      "I created outputs/lesson-plan.md and can refine it further.",
      messages,
    );
  }

  if (model === "mock-agentic-error") {
    const hadError = messages.some(
      (message) =>
        message.role === "tool" &&
        message.toolName === "read_skill" &&
        message.content.startsWith("ERROR:"),
    );

    if (!hadError) {
      return {
        ...normalize("", messages),
        toolCalls: [
          {
            id: "mock-call-error-1",
            name: "read_skill",
            input: { target: "missing-skill" },
          },
        ],
        stopReason: "tool_use",
      };
    }

    return normalize(
      "I could not load that skill, so I continued with a generic lesson structure.",
      messages,
    );
  }

  return normalize(
    `[mock:${provider}/${model}] ${latestUserMessage(messages)}`,
    messages,
  );
}

export function streamMockResponse(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
): ModelResponse {
  const content = `[mock:${provider}/${model}] ${latestUserMessage(messages)}`;
  for (const chunk of chunkText(content)) {
    onDelta(chunk);
  }
  return normalize(content, messages);
}
