import Anthropic from "@anthropic-ai/sdk";

import type { ChatMessage, ModelResponse } from "../../types";
import { estimateUsage, toInputMessages } from "../shared";

export async function callAnthropic(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 1024,
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: toInputMessages(messages).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
  });

  const content = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");

  return {
    content,
    toolCalls: [],
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      estimatedCostUsd: Number(
        (
          (response.usage.input_tokens + response.usage.output_tokens) *
          0.000002
        ).toFixed(6),
      ),
    },
    stopReason: "stop",
  };
}

export async function streamAnthropic(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  onDelta: (delta: string) => void,
  maxTokens = 1024,
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey });
  const stream = (await client.messages.create({
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: toInputMessages(messages).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
  })) as AsyncIterable<unknown>;

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of stream) {
    if (typeof event !== "object" || event === null) {
      continue;
    }

    const record = event as Record<string, unknown>;
    const eventType = record.type;

    if (eventType === "message_start") {
      const message =
        typeof record.message === "object" && record.message !== null
          ? (record.message as Record<string, unknown>)
          : null;
      const usage =
        message && typeof message.usage === "object" && message.usage !== null
          ? (message.usage as Record<string, unknown>)
          : null;

      inputTokens =
        typeof usage?.input_tokens === "number"
          ? usage.input_tokens
          : inputTokens;
      outputTokens =
        typeof usage?.output_tokens === "number"
          ? usage.output_tokens
          : outputTokens;
      continue;
    }

    if (eventType === "content_block_delta") {
      const deltaPayload =
        typeof record.delta === "object" && record.delta !== null
          ? (record.delta as Record<string, unknown>)
          : null;
      const deltaType = deltaPayload?.type;
      const deltaText =
        typeof deltaPayload?.text === "string" ? deltaPayload.text : "";

      if (deltaType !== "text_delta") {
        continue;
      }

      if (deltaText) {
        content += deltaText;
        onDelta(deltaText);
      }
      continue;
    }

    if (eventType === "message_delta") {
      const usage =
        typeof record.usage === "object" && record.usage !== null
          ? (record.usage as Record<string, unknown>)
          : null;
      outputTokens =
        typeof usage?.output_tokens === "number"
          ? usage.output_tokens
          : outputTokens;
    }
  }

  const usageFromEstimate = estimateUsage(messages, content);
  const resolvedInput = inputTokens || usageFromEstimate.inputTokens;
  const resolvedOutput = outputTokens || usageFromEstimate.outputTokens;
  const resolvedTotal = resolvedInput + resolvedOutput;

  return {
    content,
    toolCalls: [],
    usage: {
      inputTokens: resolvedInput,
      outputTokens: resolvedOutput,
      totalTokens: resolvedTotal,
      estimatedCostUsd: Number((resolvedTotal * 0.000002).toFixed(6)),
    },
    stopReason: "stop",
  };
}
