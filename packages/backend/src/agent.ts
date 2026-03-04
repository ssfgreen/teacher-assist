import { type HookRegistry, runHookPhase } from "./hooks/lifecycle";
import { callModel, streamModel } from "./model";
import {
  type ToolContext,
  dispatchToolCall,
  listToolDefinitions,
} from "./tools/registry";
import { readSubagentDefinition } from "./tools/subagents";
import type {
  ApprovalMode,
  ChatMessage,
  Provider,
  TokenUsage,
  ToolCall,
} from "./types";

export type AgentStatus =
  | "success"
  | "error_max_turns"
  | "error_max_budget"
  | "awaiting_user_question"
  | "awaiting_approval";

export interface AgentQuestionPayload {
  toolCallId: string;
  question: string;
  options?: string[];
  allowFreeText: boolean;
  toolInput: Record<string, unknown>;
}

export interface AgentApprovalPayload {
  actionId: string;
  kind: "tool_call" | "skill_selection";
  question: string;
  toolCalls: ToolCall[];
  options: string[];
  allowFreeText: boolean;
  approvalScope?: string;
  skills?: string[];
}

export interface AgentResult {
  status: AgentStatus;
  messages: ChatMessage[];
  usage: TokenUsage;
  skillsLoaded: string[];
  pendingQuestion?: AgentQuestionPayload;
  pendingApproval?: AgentApprovalPayload;
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
    delegation?: {
      enabled?: boolean;
      depth?: number;
      maxDepth?: number;
    };
    approval?: {
      mode: ApprovalMode;
      alwaysAllowScopes?: string[];
      allowedSkillNames?: string[];
    };
  };
}

interface ToolExecutionResult {
  name: string;
  output: string;
  isError: boolean;
  cacheHit: boolean;
}

interface SubagentInvocationInput {
  agent: string;
  task: string;
  context?: string;
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

function parseSubagentInvocationInput(
  input: Record<string, unknown>,
): SubagentInvocationInput {
  const agent = typeof input.agent === "string" ? input.agent.trim() : "";
  const task = typeof input.task === "string" ? input.task.trim() : "";
  const context = typeof input.context === "string" ? input.context.trim() : "";

  if (!agent) {
    throw new Error("spawn_subagent requires agent");
  }
  if (!task) {
    throw new Error("spawn_subagent requires task");
  }

  return {
    agent,
    task,
    context: context || undefined,
  };
}

function toolApprovalScope(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  if (toolName === "read_file") {
    const path = typeof toolInput.path === "string" ? toolInput.path : "";
    if (path.startsWith("classes/")) {
      return "read_class_file";
    }
  }
  if (toolName === "read_skill") {
    return "read_skill_file";
  }
  return `tool:${toolName}`;
}

function isScopeAlwaysAllowed(
  scope: string,
  alwaysAllowScopes: string[] | undefined,
): boolean {
  if (!alwaysAllowScopes || alwaysAllowScopes.length === 0) {
    return false;
  }
  return alwaysAllowScopes.includes(scope);
}

function buildToolApprovalPayload(params: {
  turn: number;
  toolCall: ToolCall;
  scope: string;
}): AgentApprovalPayload {
  const path =
    typeof params.toolCall.input.path === "string"
      ? params.toolCall.input.path
      : null;
  const target =
    typeof params.toolCall.input.target === "string"
      ? params.toolCall.input.target
      : null;
  const detail = path
    ? ` ${path}`
    : target
      ? ` ${target}`
      : ` ${params.toolCall.name}`;
  return {
    actionId: `approval:${params.turn}:${params.toolCall.id}`,
    kind: "tool_call",
    question: `Can I run tool \`${params.toolCall.name}\` for${detail}?`,
    toolCalls: [params.toolCall],
    options: ["approve", "always_allow", "deny"],
    allowFreeText: true,
    approvalScope: params.scope,
  };
}

function buildSkillApprovalPayload(params: {
  turn: number;
  toolCalls: ToolCall[];
  skills: string[];
}): AgentApprovalPayload {
  return {
    actionId: `approval:${params.turn}:skills`,
    kind: "skill_selection",
    question:
      "I can read these skills before continuing. Select the skills you want me to load.",
    toolCalls: params.toolCalls,
    options: ["approve_selected", "always_allow", "deny_all"],
    allowFreeText: false,
    approvalScope: "read_skill_file",
    skills: params.skills,
  };
}

export async function runAgentLoop(
  params: RunAgentLoopParams,
): Promise<AgentResult> {
  const maxTurns = params.options?.maxTurns ?? 25;
  const maxBudgetUsd = params.options?.maxBudgetUsd ?? Number.POSITIVE_INFINITY;
  const delegationEnabled = params.options?.delegation?.enabled ?? true;
  const delegationDepth = params.options?.delegation?.depth ?? 0;
  const delegationMaxDepth = params.options?.delegation?.maxDepth ?? 2;
  const approvalMode = params.options?.approval?.mode ?? "automation";
  const alwaysAllowScopes = params.options?.approval?.alwaysAllowScopes ?? [];
  const allowedSkillNames = new Set(
    params.options?.approval?.allowedSkillNames ?? [],
  );

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

    for (
      let toolCallIndex = 0;
      toolCallIndex < response.toolCalls.length;
      toolCallIndex += 1
    ) {
      const toolCall = response.toolCalls[toolCallIndex] as ToolCall;
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

      if (approvalMode === "feedforward") {
        if (toolCall.name === "read_skill") {
          const pendingSkillCalls = response.toolCalls
            .slice(toolCallIndex)
            .filter((call) => call.name === "read_skill")
            .map((call) => call as ToolCall);
          const skillCandidates = [
            ...new Set(
              pendingSkillCalls
                .map((call) => skillNameFromToolInput(call.input))
                .filter((name): name is string => Boolean(name)),
            ),
          ];
          const unresolved = skillCandidates.filter(
            (name) => !allowedSkillNames.has(name),
          );
          if (unresolved.length > 0) {
            return {
              status: "awaiting_approval",
              messages: messages.filter((message) => message.role !== "system"),
              usage,
              skillsLoaded: [...skillsLoaded],
              pendingApproval: buildSkillApprovalPayload({
                turn,
                toolCalls: pendingSkillCalls,
                skills: skillCandidates,
              }),
            };
          }
        } else {
          const scope = toolApprovalScope(toolCall.name, toolCall.input);
          if (!isScopeAlwaysAllowed(scope, alwaysAllowScopes)) {
            return {
              status: "awaiting_approval",
              messages: messages.filter((message) => message.role !== "system"),
              usage,
              skillsLoaded: [...skillsLoaded],
              pendingApproval: buildToolApprovalPayload({
                turn,
                toolCall,
                scope,
              }),
            };
          }
        }
      }

      if (toolCall.name === "spawn_subagent") {
        const input = parseSubagentInvocationInput(toolCall.input);

        if (!delegationEnabled) {
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolError: true,
            toolCacheHit: false,
            content:
              "ERROR: subagent delegation is disabled in this execution context",
          });
          continue;
        }

        if (delegationDepth >= delegationMaxDepth) {
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolError: true,
            toolCacheHit: false,
            content: `ERROR: subagent depth cap reached (${delegationMaxDepth})`,
            toolMetadata: {
              agent: input.agent,
              depth: delegationDepth,
              maxDepth: delegationMaxDepth,
              status: "depth_cap_reached",
            },
          });
          continue;
        }

        try {
          const definition = readSubagentDefinition(input.agent);
          const remainingBudget = Math.max(
            0,
            maxBudgetUsd - usage.estimatedCostUsd,
          );
          const subagentMessages: ChatMessage[] = [
            {
              role: "system",
              content: [
                definition.instructions,
                "Constraints:",
                "- Work only on the delegated task.",
                "- Do not ask the teacher direct questions.",
                "- Return a concise summary suitable for the planner to merge.",
              ].join("\n"),
            },
            {
              role: "user",
              content: input.context
                ? `Task:\n${input.task}\n\nContext:\n${input.context}`
                : `Task:\n${input.task}`,
            },
          ];

          const subagentResult = await runAgentLoop({
            teacherId: params.teacherId,
            sessionId: params.sessionId,
            provider: params.provider,
            model: definition.model ?? params.model,
            messages: subagentMessages,
            maxTokens: params.maxTokens,
            options: {
              maxTurns: Math.min(maxTurns, 12),
              maxBudgetUsd: remainingBudget,
              delegation: {
                enabled: false,
                depth: delegationDepth + 1,
                maxDepth: delegationMaxDepth,
              },
              approval: {
                mode: "automation",
                alwaysAllowScopes: [],
                allowedSkillNames: [],
              },
            },
          });

          usage = addUsage(usage, subagentResult.usage);
          for (const skill of subagentResult.skillsLoaded) {
            skillsLoaded.add(skill);
          }

          const subagentSummary =
            [...subagentResult.messages]
              .reverse()
              .find((message) => message.role === "assistant")
              ?.content.trim() || "";
          const stepSummaries = subagentResult.messages
            .filter((message) => message.role === "tool")
            .map((message) => ({
              tool: message.toolName ?? "tool",
              status: message.toolError ? "error" : "success",
              output: message.content.slice(0, 220),
            }));
          const subagentStatus =
            subagentResult.status === "success"
              ? "success"
              : subagentResult.status;
          const resultPayload = {
            agent: definition.name,
            task: input.task,
            summary:
              subagentSummary ||
              "Subagent completed without a textual summary.",
            steps: stepSummaries,
            status: subagentStatus,
            usage: subagentResult.usage,
          };

          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolError: subagentStatus !== "success",
            toolCacheHit: false,
            toolMetadata: {
              agent: definition.name,
              depth: delegationDepth + 1,
              maxDepth: delegationMaxDepth,
              status: subagentStatus,
              usage: subagentResult.usage,
              steps: stepSummaries,
              task: input.task,
              summary: resultPayload.summary,
            },
            content:
              subagentStatus === "awaiting_user_question"
                ? `ERROR: subagent ${definition.name} required user input unexpectedly`
                : subagentStatus === "awaiting_approval"
                  ? `ERROR: subagent ${definition.name} required approval unexpectedly`
                  : JSON.stringify(resultPayload, null, 2),
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Subagent execution failed";
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolError: true,
            toolCacheHit: false,
            toolMetadata: {
              agent: input.agent,
              depth: delegationDepth + 1,
              maxDepth: delegationMaxDepth,
              status: "error",
            },
            content: `ERROR: ${message}`,
          });
        }

        const lastToolMessage = [...messages]
          .reverse()
          .find(
            (message) =>
              message.role === "tool" && message.toolCallId === toolCall.id,
          );
        await runHookPhase({
          hooks,
          phase: "postTool",
          context: {
            turn,
            messages,
            toolCall,
            toolResult: {
              name: toolCall.name,
              output: lastToolMessage?.content ?? "",
              isError: Boolean(lastToolMessage?.toolError),
              cacheHit: false,
            },
          },
        });

        continue;
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
  const delegationEnabled = params.options?.delegation?.enabled ?? true;
  const delegationDepth = params.options?.delegation?.depth ?? 0;
  const delegationMaxDepth = params.options?.delegation?.maxDepth ?? 2;
  const approvalMode = params.options?.approval?.mode ?? "automation";
  const alwaysAllowScopes = params.options?.approval?.alwaysAllowScopes ?? [];
  const allowedSkillNames = new Set(
    params.options?.approval?.allowedSkillNames ?? [],
  );
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

    for (
      let toolCallIndex = 0;
      toolCallIndex < response.toolCalls.length;
      toolCallIndex += 1
    ) {
      const toolCall = response.toolCalls[toolCallIndex] as ToolCall;
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

      if (approvalMode === "feedforward") {
        if (toolCall.name === "read_skill") {
          const pendingSkillCalls = response.toolCalls
            .slice(toolCallIndex)
            .filter((call) => call.name === "read_skill")
            .map((call) => call as ToolCall);
          const skillCandidates = [
            ...new Set(
              pendingSkillCalls
                .map((call) => skillNameFromToolInput(call.input))
                .filter((name): name is string => Boolean(name)),
            ),
          ];
          const unresolved = skillCandidates.filter(
            (name) => !allowedSkillNames.has(name),
          );
          if (unresolved.length > 0) {
            return {
              status: "awaiting_approval",
              messages: messages.filter((message) => message.role !== "system"),
              usage,
              skillsLoaded: [...skillsLoaded],
              pendingApproval: buildSkillApprovalPayload({
                turn,
                toolCalls: pendingSkillCalls,
                skills: skillCandidates,
              }),
            };
          }
        } else {
          const scope = toolApprovalScope(toolCall.name, toolCall.input);
          if (!isScopeAlwaysAllowed(scope, alwaysAllowScopes)) {
            return {
              status: "awaiting_approval",
              messages: messages.filter((message) => message.role !== "system"),
              usage,
              skillsLoaded: [...skillsLoaded],
              pendingApproval: buildToolApprovalPayload({
                turn,
                toolCall,
                scope,
              }),
            };
          }
        }
      }

      if (toolCall.name === "spawn_subagent") {
        const input = parseSubagentInvocationInput(toolCall.input);
        let toolMessage: ChatMessage;

        if (!delegationEnabled) {
          toolMessage = {
            role: "tool",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolError: true,
            toolCacheHit: false,
            content:
              "ERROR: subagent delegation is disabled in this execution context",
          };
        } else if (delegationDepth >= delegationMaxDepth) {
          toolMessage = {
            role: "tool",
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            toolInput: toolCall.input,
            toolError: true,
            toolCacheHit: false,
            content: `ERROR: subagent depth cap reached (${delegationMaxDepth})`,
            toolMetadata: {
              agent: input.agent,
              depth: delegationDepth,
              maxDepth: delegationMaxDepth,
              status: "depth_cap_reached",
            },
          };
        } else {
          try {
            const definition = readSubagentDefinition(input.agent);
            const remainingBudget = Math.max(
              0,
              maxBudgetUsd - usage.estimatedCostUsd,
            );
            const subagentMessages: ChatMessage[] = [
              {
                role: "system",
                content: [
                  definition.instructions,
                  "Constraints:",
                  "- Work only on the delegated task.",
                  "- Do not ask the teacher direct questions.",
                  "- Return a concise summary suitable for the planner to merge.",
                ].join("\n"),
              },
              {
                role: "user",
                content: input.context
                  ? `Task:\n${input.task}\n\nContext:\n${input.context}`
                  : `Task:\n${input.task}`,
              },
            ];

            const subagentResult = await runAgentLoop({
              teacherId: params.teacherId,
              sessionId: params.sessionId,
              provider: params.provider,
              model: definition.model ?? params.model,
              messages: subagentMessages,
              maxTokens: params.maxTokens,
              options: {
                maxTurns: Math.min(maxTurns, 12),
                maxBudgetUsd: remainingBudget,
                delegation: {
                  enabled: false,
                  depth: delegationDepth + 1,
                  maxDepth: delegationMaxDepth,
                },
                approval: {
                  mode: "automation",
                  alwaysAllowScopes: [],
                  allowedSkillNames: [],
                },
              },
            });

            usage = addUsage(usage, subagentResult.usage);
            for (const skill of subagentResult.skillsLoaded) {
              skillsLoaded.add(skill);
            }

            const subagentSummary =
              [...subagentResult.messages]
                .reverse()
                .find((message) => message.role === "assistant")
                ?.content.trim() || "";
            const stepSummaries = subagentResult.messages
              .filter((message) => message.role === "tool")
              .map((message) => ({
                tool: message.toolName ?? "tool",
                status: message.toolError ? "error" : "success",
                output: message.content.slice(0, 220),
              }));
            const subagentStatus =
              subagentResult.status === "success"
                ? "success"
                : subagentResult.status;
            const resultPayload = {
              agent: definition.name,
              task: input.task,
              summary:
                subagentSummary ||
                "Subagent completed without a textual summary.",
              steps: stepSummaries,
              status: subagentStatus,
              usage: subagentResult.usage,
            };

            toolMessage = {
              role: "tool",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              toolInput: toolCall.input,
              toolError: subagentStatus !== "success",
              toolCacheHit: false,
              toolMetadata: {
                agent: definition.name,
                depth: delegationDepth + 1,
                maxDepth: delegationMaxDepth,
                status: subagentStatus,
                usage: subagentResult.usage,
                steps: stepSummaries,
                task: input.task,
                summary: resultPayload.summary,
              },
              content:
                subagentStatus === "awaiting_user_question"
                  ? `ERROR: subagent ${definition.name} required user input unexpectedly`
                  : subagentStatus === "awaiting_approval"
                    ? `ERROR: subagent ${definition.name} required approval unexpectedly`
                    : JSON.stringify(resultPayload, null, 2),
            };
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Subagent execution failed";
            toolMessage = {
              role: "tool",
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              toolInput: toolCall.input,
              toolError: true,
              toolCacheHit: false,
              toolMetadata: {
                agent: input.agent,
                depth: delegationDepth + 1,
                maxDepth: delegationMaxDepth,
                status: "error",
              },
              content: `ERROR: ${message}`,
            };
          }
        }

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
            toolResult: {
              name: toolCall.name,
              output: toolMessage.content,
              isError: Boolean(toolMessage.toolError),
              cacheHit: false,
            },
          },
        });

        continue;
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
