import { randomUUID } from "node:crypto";

import type {
  ChatMessage,
  ChatTrace,
  ChatTraceSpan,
  TokenUsage,
} from "../../types";

function toolStepFromMessage(message: ChatMessage): ChatTrace["steps"][number] {
  return {
    toolName: message.toolName ?? "tool",
    input: message.toolInput ?? {},
    output: message.content,
    isError: Boolean(message.toolError),
  };
}

function spanStatus(isError: boolean): "success" | "error" {
  return isError ? "error" : "success";
}

function toolSpans(params: {
  createdAt: string;
  toolMessages: ChatMessage[];
}): ChatTraceSpan[] {
  const spans: ChatTraceSpan[] = [];

  for (const message of params.toolMessages) {
    const id = randomUUID();
    const isError = Boolean(message.toolError);
    spans.push({
      id,
      kind: "tool",
      label: message.toolName ?? "tool",
      startedAt: params.createdAt,
      endedAt: params.createdAt,
      status: spanStatus(isError),
      metadata: {
        cacheHit: Boolean(message.toolCacheHit),
        ...(message.toolMetadata ?? {}),
      },
    });

    if (message.toolName === "spawn_subagent") {
      const agent =
        typeof message.toolMetadata?.agent === "string"
          ? message.toolMetadata.agent
          : "subagent";
      spans.push({
        id: randomUUID(),
        kind: "subagent",
        label: `spawn_subagent:${agent}`,
        startedAt: params.createdAt,
        endedAt: params.createdAt,
        status: spanStatus(isError),
        metadata: message.toolMetadata,
      });
    }

    if (message.toolName === "read_skill") {
      const target =
        typeof message.toolInput?.target === "string"
          ? message.toolInput.target
          : "skill";
      spans.push({
        id: randomUUID(),
        kind: "skill",
        label: `read_skill:${target}`,
        startedAt: params.createdAt,
        endedAt: params.createdAt,
        status: spanStatus(isError),
      });
    }
  }

  return spans;
}

function traceSummary(spans: ChatTraceSpan[]): ChatTrace["summary"] {
  return {
    toolCalls: spans.filter((span) => span.kind === "tool").length,
    hookCalls: spans.filter((span) => span.kind === "hook").length,
    skillCalls: spans.filter((span) => span.kind === "skill").length,
  };
}

export function buildTrace(params: {
  sessionId: string;
  provider: string;
  model: string;
  systemPrompt: string;
  estimatedPromptTokens: number;
  usage: TokenUsage;
  memoryContextLoaded: string[];
  requestMessages: ChatMessage[];
  agentMessages: ChatMessage[];
  includeCommandHookSpan: boolean;
}): ChatTrace {
  const createdAt = new Date().toISOString();
  const toolMessages = params.agentMessages.filter(
    (message) => message.role === "tool",
  );

  const spans: ChatTraceSpan[] = [
    {
      id: randomUUID(),
      kind: "model",
      label: "model-turn",
      startedAt: createdAt,
      endedAt: createdAt,
      status: "success",
      metadata: {
        messageCount: params.agentMessages.length,
        apiRequest: {
          provider: params.provider,
          model: params.model,
          messages: params.requestMessages.map((message) => ({
            role: message.role,
            content: message.content,
            toolName: message.toolName,
            toolInput: message.toolInput,
          })),
        },
        apiResponse: {
          messages: params.agentMessages.map((message) => ({
            role: message.role,
            content: message.content,
            toolName: message.toolName,
            toolInput: message.toolInput,
            toolError: message.toolError,
          })),
        },
      },
    },
    ...toolSpans({ createdAt, toolMessages }),
  ];

  if (params.includeCommandHookSpan) {
    spans.push({
      id: randomUUID(),
      kind: "hook",
      label: "command-hooks",
      startedAt: createdAt,
      endedAt: createdAt,
      status: "success",
    });
  }

  return {
    id: randomUUID(),
    sessionId: params.sessionId,
    createdAt,
    systemPrompt: params.systemPrompt,
    estimatedPromptTokens: params.estimatedPromptTokens,
    usage: params.usage,
    status: "success",
    memorySelectionSummary:
      params.memoryContextLoaded.length > 0
        ? `Loaded memory: ${params.memoryContextLoaded.join(", ")}`
        : "No memory loaded.",
    steps: toolMessages.map(toolStepFromMessage),
    spans,
    summary: traceSummary(spans),
  };
}

export function buildPendingCommandTrace(params: {
  sessionId: string;
  systemPrompt: string;
  estimatedPromptTokens: number;
  memoryContextLoaded: string[];
}): ChatTrace {
  const createdAt = new Date().toISOString();
  const usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
  const spans: ChatTraceSpan[] = [
    {
      id: randomUUID(),
      kind: "feedforward",
      label: "feedforward-gate",
      startedAt: createdAt,
      endedAt: createdAt,
      status: "pending",
    },
  ];

  return {
    id: randomUUID(),
    sessionId: params.sessionId,
    createdAt,
    systemPrompt: params.systemPrompt,
    estimatedPromptTokens: params.estimatedPromptTokens,
    usage,
    status: "success",
    memorySelectionSummary:
      params.memoryContextLoaded.length > 0
        ? `Loaded memory: ${params.memoryContextLoaded.join(", ")}`
        : "No memory loaded.",
    steps: [],
    spans,
    summary: traceSummary(spans),
  };
}

export function appendCommandReviewSpans(trace: ChatTrace): ChatTrace {
  const endedAt = new Date().toISOString();
  const extra: ChatTraceSpan[] = [
    {
      id: randomUUID(),
      kind: "reflection",
      label: "reflection-gate",
      startedAt: trace.createdAt,
      endedAt,
      status: "pending",
    },
    {
      id: randomUUID(),
      kind: "adjudication",
      label: "adjudication-gate",
      startedAt: trace.createdAt,
      endedAt,
      status: "pending",
    },
  ];

  const spans = [...trace.spans, ...extra];
  return {
    ...trace,
    spans,
    summary: traceSummary(spans),
  };
}

export function appendApprovalSpan(
  trace: ChatTrace,
  label: string,
  metadata?: Record<string, unknown>,
): ChatTrace {
  const endedAt = new Date().toISOString();
  const spans: ChatTraceSpan[] = [
    ...trace.spans,
    {
      id: randomUUID(),
      kind: "approval",
      label,
      startedAt: trace.createdAt,
      endedAt,
      status: "pending",
      metadata,
    },
  ];
  return {
    ...trace,
    spans,
    summary: traceSummary(spans),
  };
}
