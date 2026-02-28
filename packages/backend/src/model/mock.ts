import type { ChatMessage, ModelResponse, Provider } from "../types";
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
