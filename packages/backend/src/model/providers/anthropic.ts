import Anthropic from "@anthropic-ai/sdk";

import type {
  ChatMessage,
  ModelResponse,
  ModelToolDefinition,
  ToolCall,
} from "../../types";
import { estimateUsage, extractSystemPrompt, toInputMessages } from "../shared";

function parseAnthropicToolCalls(content: unknown): ToolCall[] {
  if (!Array.isArray(content)) {
    return [];
  }

  const toolCalls: ToolCall[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) {
      continue;
    }

    const record = block as Record<string, unknown>;
    if (record.type !== "tool_use") {
      continue;
    }

    const id = typeof record.id === "string" ? record.id : "";
    const name = typeof record.name === "string" ? record.name : "";
    const input =
      typeof record.input === "object" && record.input !== null
        ? (record.input as Record<string, unknown>)
        : {};

    if (!id || !name) {
      continue;
    }

    toolCalls.push({ id, name, input });
  }

  return toolCalls;
}

export async function callAnthropic(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens = 1024,
  tools?: ModelToolDefinition[],
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = extractSystemPrompt(messages);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt || undefined,
    messages: toInputMessages(messages, { includeSystem: false }).map(
      (message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }),
    ),
    tools: tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  });

  const parsedToolCalls = parseAnthropicToolCalls(response.content);
  const content = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n");

  return {
    content,
    toolCalls: parsedToolCalls,
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
    stopReason: parsedToolCalls.length > 0 ? "tool_use" : "stop",
  };
}

export async function streamAnthropic(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  onDelta: (delta: string) => Promise<void> | void,
  maxTokens = 1024,
  tools?: ModelToolDefinition[],
): Promise<ModelResponse> {
  const client = new Anthropic({ apiKey });
  const systemPrompt = extractSystemPrompt(messages);
  const stream = (await client.messages.create({
    model,
    max_tokens: maxTokens,
    stream: true,
    system: systemPrompt || undefined,
    messages: toInputMessages(messages, { includeSystem: false }).map(
      (message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      }),
    ),
    tools: tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  })) as AsyncIterable<unknown>;

  let content = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCallsByIndex = new Map<
    number,
    {
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      partial: string;
    }
  >();

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
        if (deltaType === "input_json_delta") {
          const index =
            typeof record.index === "number" ? record.index : Number.NaN;
          const partial =
            typeof deltaPayload?.partial_json === "string"
              ? deltaPayload.partial_json
              : "";
          if (!Number.isNaN(index) && partial) {
            const existing = toolCallsByIndex.get(index) ?? { partial: "" };
            existing.partial += partial;
            toolCallsByIndex.set(index, existing);
          }
        }
        continue;
      }

      if (deltaText) {
        content += deltaText;
        await onDelta(deltaText);
      }
      continue;
    }

    if (eventType === "content_block_start") {
      const index =
        typeof record.index === "number" ? record.index : Number.NaN;
      const block =
        typeof record.content_block === "object" &&
        record.content_block !== null
          ? (record.content_block as Record<string, unknown>)
          : null;
      if (
        Number.isNaN(index) ||
        !block ||
        block.type !== "tool_use" ||
        typeof block.id !== "string" ||
        typeof block.name !== "string"
      ) {
        continue;
      }

      const existing = toolCallsByIndex.get(index) ?? { partial: "" };
      existing.id = block.id;
      existing.name = block.name;
      if (typeof block.input === "object" && block.input !== null) {
        existing.input = block.input as Record<string, unknown>;
      }
      toolCallsByIndex.set(index, existing);
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
  const toolCalls: ToolCall[] = [];

  for (const [index, call] of [...toolCallsByIndex.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    if (!call.id || !call.name) {
      continue;
    }

    let input = call.input ?? {};
    if ((!input || Object.keys(input).length === 0) && call.partial.trim()) {
      try {
        const parsed = JSON.parse(call.partial) as unknown;
        if (typeof parsed === "object" && parsed !== null) {
          input = parsed as Record<string, unknown>;
        }
      } catch {
        input = {};
      }
    }

    toolCalls.push({
      id: call.id,
      name: call.name,
      input,
    });
  }

  return {
    content,
    toolCalls,
    usage: {
      inputTokens: resolvedInput,
      outputTokens: resolvedOutput,
      totalTokens: resolvedTotal,
      estimatedCostUsd: Number((resolvedTotal * 0.000002).toFixed(6)),
    },
    stopReason: toolCalls.length > 0 ? "tool_use" : "stop",
  };
}
