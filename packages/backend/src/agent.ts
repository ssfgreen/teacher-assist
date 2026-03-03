import { type HookRegistry, runHookPhase } from "./hooks/lifecycle";
import { callModel, streamModel } from "./model";
import {
  type ToolContext,
  dispatchToolCall,
  listToolDefinitions,
} from "./tools/registry";
import type { ChatMessage, Provider, TokenUsage } from "./types";

export type AgentStatus =
  | "success"
  | "error_max_turns"
  | "error_max_budget"
  | "awaiting_user_question";

export interface AgentQuestionPayload {
  toolCallId: string;
  question: string;
  options?: string[];
  allowFreeText: boolean;
  toolInput: Record<string, unknown>;
}

export interface AgentResult {
  status: AgentStatus;
  messages: ChatMessage[];
  usage: TokenUsage;
  skillsLoaded: string[];
  pendingQuestion?: AgentQuestionPayload;
}

export interface AgentStreamEvent {
  message: ChatMessage;
  isFinalAssistant: boolean;
}

interface RunAgentLoopParams {
  teacherId: string;
  sessionId?: string;
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  options?: {
    maxTurns?: number;
    maxBudgetUsd?: number;
    hooks?: HookRegistry;
  };
}

interface ToolExecutionResult {
  name: string;
  output: string;
  isError: boolean;
  cacheHit: boolean;
}

const READ_ONCE_TOOLS = new Set([
  "read_file",
  "read_skill",
  "read_memory",
  "list_directory",
]);

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    estimatedCostUsd: Number(
      (total.estimatedCostUsd + next.estimatedCostUsd).toFixed(6),
    ),
  };
}

function skillNameFromToolInput(input: Record<string, unknown>): string | null {
  const target = typeof input.target === "string" ? input.target : "";
  if (!target) {
    return null;
  }

  const [name] = target.split("/");
  return name || null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function normalizeToolInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...input };
  if (typeof normalized.path === "string") {
    normalized.path = normalized.path.trim();
  }
  if (typeof normalized.target === "string") {
    normalized.target = normalized.target.trim();
  }
  return normalized;
}

function readOnceToolKey(
  name: string,
  input: Record<string, unknown>,
): string | null {
  if (!READ_ONCE_TOOLS.has(name)) {
    return null;
  }

  return `${name}|${stableJson(normalizeToolInput(input))}`;
}

async function executeToolWithReadOnceCache(params: {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolContext: ToolContext;
  cache: Map<
    string,
    {
      name: string;
      output: string;
      isError: boolean;
    }
  >;
}): Promise<ToolExecutionResult> {
  const key = readOnceToolKey(params.toolName, params.toolInput);
  if (key) {
    const cached = params.cache.get(key);
    if (cached) {
      return {
        ...cached,
        cacheHit: true,
      };
    }
  }

  const result = await dispatchToolCall(
    { id: "tool-call", name: params.toolName, input: params.toolInput },
    params.toolContext,
  );

  if (key) {
    params.cache.set(key, {
      name: result.name,
      output: result.output,
      isError: result.isError,
    });
  }

  return {
    name: result.name,
    output: result.output,
    isError: result.isError,
    cacheHit: false,
  };
}

function toQuestionPayload(params: {
  toolCallId: string;
  toolInput: Record<string, unknown>;
}): AgentQuestionPayload {
  const question = String(params.toolInput.question || "").trim();
  if (!question) {
    throw new Error("ask_user_question requires question");
  }

  const rawOptions = Array.isArray(params.toolInput.options)
    ? params.toolInput.options
    : undefined;
  const options =
    rawOptions
      ?.map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0) ?? [];

  const allowFreeText =
    typeof params.toolInput.allow_free_text === "boolean"
      ? params.toolInput.allow_free_text
      : false;

  return {
    toolCallId: params.toolCallId,
    question,
    options: options.length > 0 ? options : undefined,
    allowFreeText,
    toolInput: params.toolInput,
  };
}

export async function runAgentLoop(
  params: RunAgentLoopParams,
): Promise<AgentResult> {
  const maxTurns = params.options?.maxTurns ?? 25;
  const maxBudgetUsd = params.options?.maxBudgetUsd ?? Number.POSITIVE_INFINITY;

  const messages = [...params.messages];
  let usage = emptyUsage();
  const skillsLoaded = new Set<string>();

  const toolContext: ToolContext = {
    teacherId: params.teacherId,
    sessionId: params.sessionId,
  };
  const tools = listToolDefinitions();
  const readOnceResultCache = new Map<
    string,
    { name: string; output: string; isError: boolean }
  >();
  const hooks = params.options?.hooks;

  await runHookPhase({
    hooks,
    phase: "preLoop",
    context: {
      messages,
    },
  });

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (usage.estimatedCostUsd > maxBudgetUsd) {
      return {
        status: "error_max_budget",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    await runHookPhase({
      hooks,
      phase: "preModel",
      context: {
        turn,
        messages,
      },
    });

    const response = await callModel(
      params.provider,
      params.model,
      messages,
      params.maxTokens,
      tools,
    );

    usage = addUsage(usage, response.usage);

    await runHookPhase({
      hooks,
      phase: "postModel",
      context: {
        turn,
        messages,
        modelResponse: response,
      },
    });

    if (usage.estimatedCostUsd > maxBudgetUsd) {
      return {
        status: "error_max_budget",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    if (response.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: response.content });
      await runHookPhase({
        hooks,
        phase: "postLoop",
        context: {
          turn,
          messages,
        },
      });
      return {
        status: "success",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    if (response.content.trim()) {
      messages.push({ role: "assistant", content: response.content });
    }

    for (const toolCall of response.toolCalls) {
      await runHookPhase({
        hooks,
        phase: "preTool",
        context: {
          turn,
          messages,
          toolCall,
        },
      });

      if (toolCall.name === "ask_user_question") {
        return {
          status: "awaiting_user_question",
          messages: messages.filter((message) => message.role !== "system"),
          usage,
          skillsLoaded: [...skillsLoaded],
          pendingQuestion: toQuestionPayload({
            toolCallId: toolCall.id,
            toolInput: toolCall.input,
          }),
        };
      }

      const result = await executeToolWithReadOnceCache({
        toolName: toolCall.name,
        toolInput: toolCall.input,
        toolContext,
        cache: readOnceResultCache,
      });
      const content = result.isError
        ? `ERROR: ${result.output}`
        : result.output;

      if (result.name === "read_skill" && !result.isError) {
        const skillName = skillNameFromToolInput(toolCall.input);
        if (skillName) {
          skillsLoaded.add(skillName);
        }
      }

      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        toolName: result.name,
        toolInput: toolCall.input,
        toolError: result.isError,
        toolCacheHit: result.cacheHit,
        content,
      });

      await runHookPhase({
        hooks,
        phase: "postTool",
        context: {
          turn,
          messages,
          toolCall,
          toolResult: result,
        },
      });
    }
  }

  return {
    status: "error_max_turns",
    messages: messages.filter((message) => message.role !== "system"),
    usage,
    skillsLoaded: [...skillsLoaded],
  };
}

export async function runAgentLoopStreaming(
  params: RunAgentLoopParams & {
    onEvent: (event: AgentStreamEvent) => Promise<void> | void;
    chunkAssistantText?: (content: string) => string[];
    shouldStop?: () => boolean;
  },
): Promise<AgentResult> {
  const maxTurns = params.options?.maxTurns ?? 25;
  const maxBudgetUsd = params.options?.maxBudgetUsd ?? Number.POSITIVE_INFINITY;
  const chunkAssistantText =
    params.chunkAssistantText ??
    ((content: string) => {
      const chunks = content.match(/\S+\s*/g);
      return chunks ?? [content];
    });

  const messages = [...params.messages];
  let usage = emptyUsage();
  const skillsLoaded = new Set<string>();

  const toolContext: ToolContext = {
    teacherId: params.teacherId,
    sessionId: params.sessionId,
  };
  const tools = listToolDefinitions();
  const readOnceResultCache = new Map<
    string,
    { name: string; output: string; isError: boolean }
  >();
  const hooks = params.options?.hooks;

  await runHookPhase({
    hooks,
    phase: "preLoop",
    context: {
      messages,
    },
  });

  const stopped = () => Boolean(params.shouldStop?.());

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (stopped()) {
      return {
        status: "success",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    if (usage.estimatedCostUsd > maxBudgetUsd) {
      return {
        status: "error_max_budget",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    let running = "";
    await runHookPhase({
      hooks,
      phase: "preModel",
      context: {
        turn,
        messages,
      },
    });
    const response = await streamModel(
      params.provider,
      params.model,
      messages,
      async (delta) => {
        running += delta;
        await params.onEvent({
          message: { role: "assistant", content: running },
          isFinalAssistant: false,
        });
      },
      params.maxTokens,
      tools,
    );
    usage = addUsage(usage, response.usage);
    await runHookPhase({
      hooks,
      phase: "postModel",
      context: {
        turn,
        messages,
        modelResponse: response,
      },
    });

    if (response.content.trim()) {
      if (!running) {
        for (const chunk of chunkAssistantText(response.content)) {
          if (stopped()) {
            return {
              status: "success",
              messages: messages.filter((message) => message.role !== "system"),
              usage,
              skillsLoaded: [...skillsLoaded],
            };
          }
          running += chunk;
          await params.onEvent({
            message: { role: "assistant", content: running },
            isFinalAssistant: false,
          });
        }
      }
      messages.push({ role: "assistant", content: response.content });
    }

    if (response.toolCalls.length === 0) {
      await runHookPhase({
        hooks,
        phase: "postLoop",
        context: {
          turn,
          messages,
        },
      });
      return {
        status: "success",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    for (const toolCall of response.toolCalls) {
      if (stopped()) {
        return {
          status: "success",
          messages: messages.filter((message) => message.role !== "system"),
          usage,
          skillsLoaded: [...skillsLoaded],
        };
      }

      await runHookPhase({
        hooks,
        phase: "preTool",
        context: {
          turn,
          messages,
          toolCall,
        },
      });

      if (toolCall.name === "ask_user_question") {
        return {
          status: "awaiting_user_question",
          messages: messages.filter((message) => message.role !== "system"),
          usage,
          skillsLoaded: [...skillsLoaded],
          pendingQuestion: toQuestionPayload({
            toolCallId: toolCall.id,
            toolInput: toolCall.input,
          }),
        };
      }

      const result = await executeToolWithReadOnceCache({
        toolName: toolCall.name,
        toolInput: toolCall.input,
        toolContext,
        cache: readOnceResultCache,
      });
      const content = result.isError
        ? `ERROR: ${result.output}`
        : result.output;

      if (result.name === "read_skill" && !result.isError) {
        const skillName = skillNameFromToolInput(toolCall.input);
        if (skillName) {
          skillsLoaded.add(skillName);
        }
      }

      const toolMessage: ChatMessage = {
        role: "tool",
        toolCallId: toolCall.id,
        toolName: result.name,
        toolInput: toolCall.input,
        toolError: result.isError,
        toolCacheHit: result.cacheHit,
        content,
      };

      messages.push(toolMessage);
      await params.onEvent({
        message: toolMessage,
        isFinalAssistant: false,
      });

      await runHookPhase({
        hooks,
        phase: "postTool",
        context: {
          turn,
          messages,
          toolCall,
          toolResult: result,
        },
      });
    }
  }

  return {
    status: "error_max_turns",
    messages: messages.filter((message) => message.role !== "system"),
    usage,
    skillsLoaded: [...skillsLoaded],
  };
}
