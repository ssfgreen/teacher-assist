import { callModel } from "./model";
import {
  type ToolContext,
  dispatchToolCall,
  listToolDefinitions,
} from "./tools/registry";
import type { ChatMessage, Provider, TokenUsage } from "./types";

export type AgentStatus = "success" | "error_max_turns" | "error_max_budget";

export interface AgentResult {
  status: AgentStatus;
  messages: ChatMessage[];
  usage: TokenUsage;
  skillsLoaded: string[];
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
  };
}

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

  for (let turn = 0; turn < maxTurns; turn += 1) {
    if (usage.estimatedCostUsd > maxBudgetUsd) {
      return {
        status: "error_max_budget",
        messages: messages.filter((message) => message.role !== "system"),
        usage,
        skillsLoaded: [...skillsLoaded],
      };
    }

    const response = await callModel(
      params.provider,
      params.model,
      messages,
      params.maxTokens,
      tools,
    );

    usage = addUsage(usage, response.usage);

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
      const result = await dispatchToolCall(toolCall, toolContext);
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
        content,
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
