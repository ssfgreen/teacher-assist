import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

import type { ChatMessage, ModelResponse, Provider } from "./types";

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

function estimateUsage(
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

function normalize(content: string, messages: ChatMessage[]): ModelResponse {
  return {
    content,
    toolCalls: [],
    usage: estimateUsage(messages, content),
    stopReason: "stop",
  };
}

function toInputMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role !== "system");
}

function isMockModel(model: string): boolean {
  return model === "mock" || model.startsWith("mock-");
}

function openAiTokenLimitParam(
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

function chunkText(content: string): string[] {
  const parts = content.match(/\S+\s*/g);
  return parts ?? [content];
}

function resolveApiKey(provider: Provider): string {
  const apiKey =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ModelConfigurationError(
      `Missing ${provider.toUpperCase()} API key. Select a mock model or configure the key.`,
    );
  }

  return apiKey;
}

async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens?: number,
): Promise<ModelResponse> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    ...openAiTokenLimitParam(model, maxTokens),
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const usage = completion.usage;

  return {
    content,
    toolCalls: [],
    usage: {
      inputTokens:
        usage?.prompt_tokens ?? estimateUsage(messages, content).inputTokens,
      outputTokens:
        usage?.completion_tokens ??
        estimateUsage(messages, content).outputTokens,
      totalTokens:
        usage?.total_tokens ?? estimateUsage(messages, content).totalTokens,
      estimatedCostUsd: Number(
        (
          (usage?.total_tokens ??
            estimateUsage(messages, content).totalTokens) * 0.000002
        ).toFixed(6),
      ),
    },
    stopReason: "stop",
  };
}

async function streamOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  onDelta: (delta: string) => void,
  maxTokens?: number,
): Promise<ModelResponse> {
  const client = new OpenAI({ apiKey });
  const stream = await client.chat.completions.create({
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    stream: true,
    ...openAiTokenLimitParam(model, maxTokens),
  });

  let content = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) {
      continue;
    }
    content += delta;
    onDelta(delta);
  }

  return normalize(content, messages);
}

async function callAnthropic(
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

async function streamAnthropic(
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

      const delta = deltaText;
      if (delta) {
        content += delta;
        onDelta(delta);
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

export async function streamModel(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  maxTokens?: number,
): Promise<ModelResponse> {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";

  if (isMockModel(model)) {
    const content = `[mock:${provider}/${model}] ${latestUserMessage}`;
    for (const chunk of chunkText(content)) {
      onDelta(chunk);
    }
    return normalize(content, messages);
  }

  const apiKey = resolveApiKey(provider);

  if (provider === "openai") {
    return streamOpenAI(model, messages, apiKey, onDelta, maxTokens);
  }

  return streamAnthropic(model, messages, apiKey, onDelta, maxTokens);
}

export async function callModel(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  maxTokens?: number,
): Promise<ModelResponse> {
  const latestUserMessage =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";

  if (isMockModel(model)) {
    return normalize(
      `[mock:${provider}/${model}] ${latestUserMessage}`,
      messages,
    );
  }

  const apiKey = resolveApiKey(provider);

  if (provider === "openai") {
    return callOpenAI(model, messages, apiKey, maxTokens);
  }

  return callAnthropic(model, messages, apiKey, maxTokens);
}

export function assertValidProvider(
  provider: string,
): asserts provider is Provider {
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error("Unsupported provider");
  }
}
