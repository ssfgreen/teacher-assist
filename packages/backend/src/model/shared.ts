import type { ChatMessage, ModelResponse } from "../types";

export function estimateUsage(
  messages: ChatMessage[],
  content: string,
): ModelResponse["usage"] {
  const inputChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const outputChars = content.length;

  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  const totalTokens = inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: Number((totalTokens * 0.000002).toFixed(6)),
  };
}

export function normalize(
  content: string,
  messages: ChatMessage[],
): ModelResponse {
  return {
    content,
    toolCalls: [],
    usage: estimateUsage(messages, content),
    stopReason: "stop",
  };
}

export function toInputMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role !== "system");
}

export function openAiTokenLimitParam(
  model: string,
  maxTokens?: number,
): Record<string, number> {
  if (typeof maxTokens !== "number") {
    return {};
  }

  if (model.startsWith("gpt-5")) {
    return { max_completion_tokens: maxTokens };
  }

  return { max_tokens: maxTokens };
}
