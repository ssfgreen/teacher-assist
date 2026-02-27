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

async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<ModelResponse> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
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

async function callAnthropic(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
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

export async function callModel(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
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

  const apiKey =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ModelConfigurationError(
      `Missing ${provider.toUpperCase()} API key. Select a mock model or configure the key.`,
    );
  }

  if (provider === "openai") {
    return callOpenAI(model, messages, apiKey);
  }

  return callAnthropic(model, messages, apiKey);
}

export function assertValidProvider(
  provider: string,
): asserts provider is Provider {
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error("Unsupported provider");
  }
}
