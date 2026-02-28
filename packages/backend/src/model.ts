import { isMockModel, mockResponse, streamMockResponse } from "./model/mock";
import { callAnthropic, streamAnthropic } from "./model/providers/anthropic";
import { callOpenAI, streamOpenAI } from "./model/providers/openai";
import type {
  ChatMessage,
  ModelResponse,
  ModelToolDefinition,
  Provider,
} from "./types";

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigurationError";
  }
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

export async function streamModel(
  provider: Provider,
  model: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  maxTokens?: number,
): Promise<ModelResponse> {
  if (isMockModel(model)) {
    return streamMockResponse(provider, model, messages, onDelta);
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
  tools?: ModelToolDefinition[],
): Promise<ModelResponse> {
  if (isMockModel(model)) {
    return mockResponse(provider, model, messages);
  }

  const apiKey = resolveApiKey(provider);

  if (provider === "openai") {
    return callOpenAI(model, messages, apiKey, maxTokens, tools);
  }

  return callAnthropic(model, messages, apiKey, maxTokens, tools);
}

export function assertValidProvider(
  provider: string,
): asserts provider is Provider {
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error("Unsupported provider");
  }
}
