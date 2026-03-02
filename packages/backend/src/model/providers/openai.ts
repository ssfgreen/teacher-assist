import OpenAI from "openai";

import type {
  ChatMessage,
  ModelResponse,
  ModelToolDefinition,
  ToolCall,
} from "../../types";
import {
  estimateUsage,
  normalize,
  openAiTokenLimitParam,
  toInputMessages,
} from "../shared";

function parseOpenAIToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const toolCalls: ToolCall[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";

    const fn =
      typeof record.function === "object" && record.function !== null
        ? (record.function as Record<string, unknown>)
        : null;
    const name = typeof fn?.name === "string" ? fn.name : "";
    const rawArgs = typeof fn?.arguments === "string" ? fn.arguments : "{}";

    if (!id || !name) {
      continue;
    }

    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(rawArgs) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      input = {};
    }

    toolCalls.push({ id, name, input });
  }

  return toolCalls;
}

export async function callOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  maxTokens?: number,
  tools?: ModelToolDefinition[],
): Promise<ModelResponse> {
  const client = new OpenAI({ apiKey });

  const openAiTools = tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const completion = await client.chat.completions.create({
    model,
    messages: toInputMessages(messages).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    tools: openAiTools,
    ...openAiTokenLimitParam(model, maxTokens),
  });

  const choice = completion.choices[0];
  const content = choice?.message?.content ?? "";
  const parsedToolCalls = parseOpenAIToolCalls(choice?.message?.tool_calls);
  const usage = completion.usage;

  return {
    content,
    toolCalls: parsedToolCalls,
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
    stopReason: parsedToolCalls.length > 0 ? "tool_use" : "stop",
  };
}

export async function streamOpenAI(
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  onDelta: (delta: string) => Promise<void> | void,
  maxTokens?: number,
  tools?: ModelToolDefinition[],
): Promise<ModelResponse> {
  const client = new OpenAI({ apiKey });
  const openAiTools = tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  const stream = await client.chat.completions.create({
    model,
    messages: toInputMessages(messages).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    tools: openAiTools,
    stream: true,
    stream_options: { include_usage: true },
    ...openAiTokenLimitParam(model, maxTokens),
  });

  let content = "";
  const toolCallParts = new Map<
    number,
    { id?: string; name?: string; args: string }
  >();
  let usage:
    | {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      }
    | undefined;

  for await (const chunk of stream) {
    if (chunk.usage) {
      usage = chunk.usage;
    }

    const deltaBlock = chunk.choices[0]?.delta;
    const streamedToolCalls = deltaBlock?.tool_calls;
    if (Array.isArray(streamedToolCalls)) {
      for (const call of streamedToolCalls) {
        const index = typeof call.index === "number" ? call.index : 0;
        const existing = toolCallParts.get(index) ?? { args: "" };

        if (typeof call.id === "string" && call.id) {
          existing.id = call.id;
        }
        if (
          typeof call.function === "object" &&
          call.function !== null &&
          typeof call.function.name === "string" &&
          call.function.name
        ) {
          existing.name = call.function.name;
        }
        if (
          typeof call.function === "object" &&
          call.function !== null &&
          typeof call.function.arguments === "string"
        ) {
          existing.args += call.function.arguments;
        }

        toolCallParts.set(index, existing);
      }
    }

    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) {
      continue;
    }
    content += delta;
    await onDelta(delta);
  }

  const toolCalls: ToolCall[] = [];
  for (const [index, call] of [...toolCallParts.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    if (!call.id || !call.name) {
      continue;
    }

    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.args || "{}") as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      input = {};
    }

    toolCalls.push({
      id: call.id,
      name: call.name,
      input,
    });
  }

  const fallbackUsage = estimateUsage(messages, content);

  return {
    content,
    toolCalls,
    usage: {
      inputTokens: usage?.prompt_tokens ?? fallbackUsage.inputTokens,
      outputTokens: usage?.completion_tokens ?? fallbackUsage.outputTokens,
      totalTokens: usage?.total_tokens ?? fallbackUsage.totalTokens,
      estimatedCostUsd: Number(
        ((usage?.total_tokens ?? fallbackUsage.totalTokens) * 0.000002).toFixed(
          6,
        ),
      ),
    },
    stopReason: toolCalls.length > 0 ? "tool_use" : "stop",
  };
}
