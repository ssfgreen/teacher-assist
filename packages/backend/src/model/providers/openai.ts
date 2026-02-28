import OpenAI from "openai";

import type { ChatMessage, ModelResponse } from "../../types";
import { estimateUsage, normalize, openAiTokenLimitParam } from "../shared";

export async function callOpenAI(
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

export async function streamOpenAI(
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
