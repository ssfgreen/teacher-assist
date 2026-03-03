import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";

import {
  type AgentQuestionPayload,
  runAgentLoop,
  runAgentLoopStreaming,
} from "../../agent";
import {
  commandInstructions,
  getCommandDefinition,
} from "../../commands/catalog";
import { throwApiError } from "../../common/api-error";
import {
  type MemoryProposal,
  appendCategorizedMemoryEntry,
  loadMemoryContext,
} from "../../memory";
import type { MemoryCategory } from "../../memory-format";
import { extractNovelMemoryProposals } from "../../memory-preferences";
import { ModelConfigurationError, assertValidProvider } from "../../model";
import { DEFAULT_AGENT_INSTRUCTIONS, assembleSystemPrompt } from "../../prompt";
import {
  appendSessionMessages,
  checkRateLimit,
  createSession,
  readSession,
} from "../../store";
import { listToolDefinitions } from "../../tools/registry";
import { buildSkillManifestText } from "../../tools/skills";
import type { ChatMessage, ChatTrace, Provider, TokenUsage } from "../../types";
import { loadWorkspaceContext } from "../../workspace";

export interface FeedforwardPayload {
  summary: string;
}

export interface ReflectionPayload {
  prompt: string;
}

export interface AdjudicationPayload {
  sections: Array<{
    id: string;
    title: string;
    preview: string;
  }>;
}

export interface QuestionPayload {
  question: string;
  options?: string[];
  allow_free_text: boolean;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  provider: string;
  model: string;
  command?: string;
  sessionId?: string;
  stream?: boolean;
  maxTokens?: number;
  classRef?: string;
}

export interface MemoryResponseBody {
  sessionId: string;
  decisions: Array<{
    text: string;
    decision: "confirm" | "dismiss";
    scope: "teacher" | "class";
    classId?: string;
    category?: MemoryCategory;
  }>;
}

export interface FeedforwardResponseBody {
  sessionId: string;
  action: "confirm" | "edit" | "dismiss";
  note?: string;
}

export interface AdjudicationResponseBody {
  sessionId: string;
  action: "acknowledge" | "skip" | "accept" | "revise" | "alternatives";
  note?: string;
}

export interface QuestionResponseBody {
  sessionId: string;
  answer: string;
}

type ChatStatus =
  | "success"
  | "awaiting_memory_capture"
  | "no_new_memory"
  | "awaiting_feedforward"
  | "awaiting_reflection"
  | "awaiting_adjudication"
  | "awaiting_user_question";

interface ChatResultPayload {
  response: {
    content: string;
    toolCalls: [];
    usage: TokenUsage;
    stopReason: "stop" | "error";
  };
  status: ChatStatus;
  proposals?: MemoryProposal[];
  feedforward?: FeedforwardPayload;
  reflection?: ReflectionPayload;
  adjudication?: AdjudicationPayload;
  question?: QuestionPayload;
  sessionId: string;
  messages: ChatMessage[];
  skillsLoaded: string[];
  workspaceContextLoaded: string[];
  memoryContextLoaded: string[];
  trace: ChatTrace;
}

interface LoopContext {
  teacherId: string;
  sessionId: string;
  provider: Provider;
  model: string;
  maxTokens?: number;
  commandId?: string;
  modelMessages: ChatMessage[];
  workspaceContext: Awaited<ReturnType<typeof loadWorkspaceContext>>;
  memoryContextLoaded: string[];
  systemPrompt: string;
  estimatedTokens: number;
}

type PendingInteraction =
  | {
      type: "awaiting_feedforward";
      teacherId: string;
      loop: LoopContext;
    }
  | {
      type: "awaiting_user_question";
      teacherId: string;
      loop: LoopContext;
      pendingQuestion: AgentQuestionPayload;
    }
  | {
      type: "awaiting_reflection";
      teacherId: string;
      commandId?: string;
      loop: LoopContext;
      finalPayload: ChatResultPayload;
      reflection: ReflectionPayload;
      adjudication: AdjudicationPayload;
    }
  | {
      type: "awaiting_adjudication";
      teacherId: string;
      commandId?: string;
      loop: LoopContext;
      finalPayload: ChatResultPayload;
      reflection: ReflectionPayload;
      adjudication: AdjudicationPayload;
    };

const pendingChatInteractions = new Map<string, PendingInteraction>();

function resolveDecisionCategory(item: {
  scope: "teacher" | "class";
  category?: MemoryCategory;
}): MemoryCategory {
  if (item.scope === "class") {
    return "class";
  }
  return item.category === "pedagogical" ? "pedagogical" : "personal";
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function streamChunks(text: string): string[] {
  const chunks = text.match(/\S+\s*/g);
  return chunks ?? [text];
}

function nonSystemMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((message) => message.role !== "system");
}

function latestUserMessage(messages: ChatMessage[]): string {
  const latest = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  return latest ?? "";
}

function parseHeadingSections(
  content: string,
): AdjudicationPayload["sections"] {
  const lines = content.split("\n");
  const sections: Array<{ id: string; title: string; preview: string }> = [];

  let currentTitle = "Full response";
  let currentBody: string[] = [];

  const pushCurrent = () => {
    const preview = currentBody.join(" ").trim().slice(0, 180);
    if (!preview && currentTitle === "Full response") {
      return;
    }
    sections.push({
      id: `section-${sections.length + 1}`,
      title: currentTitle,
      preview: preview || "(empty section)",
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      pushCurrent();
      currentTitle = line.replace(/^##\s+/, "");
      currentBody = [];
      continue;
    }
    if (line.length > 0) {
      currentBody.push(line);
    }
  }
  pushCurrent();

  if (sections.length === 0) {
    return {
      sections: [
        {
          id: "section-1",
          title: "Full response",
          preview: content.trim().slice(0, 180) || "(empty response)",
        },
      ],
    };
  }
  return { sections };
}

function feedforwardSummary(params: {
  commandId: string;
  classRef?: string | null;
  workspacePaths: string[];
  memoryPaths: string[];
}): FeedforwardPayload {
  const command = getCommandDefinition(params.commandId);
  const classLabel = params.classRef ? ` for class ${params.classRef}` : "";
  const workspace =
    params.workspacePaths.length > 0
      ? params.workspacePaths.join(", ")
      : "none loaded";
  const memory =
    params.memoryPaths.length > 0 ? params.memoryPaths.join(", ") : "none";

  return {
    summary: [
      `You're about to run ${command?.label ?? params.commandId}${classLabel}.`,
      `Workspace context: ${workspace}.`,
      `Memory context: ${memory}.`,
      "Confirm to continue, edit to add guidance, or dismiss to continue without inferred context assumptions.",
    ].join(" "),
  };
}

async function createSessionIfNeeded(params: {
  teacherId: string;
  sessionId?: string;
  provider: Provider;
  model: string;
  classRef?: string | null;
}): Promise<{ sessionId: string; existingMessageCount: number }> {
  if (params.sessionId) {
    const existing = await readSession(params.sessionId);
    if (!existing || existing.teacherId !== params.teacherId) {
      throwApiError(404, "Session not found");
    }
    return {
      sessionId: params.sessionId,
      existingMessageCount: existing.messages.length,
    };
  }

  return {
    sessionId: (
      await createSession({
        teacherId: params.teacherId,
        provider: params.provider,
        model: params.model,
        classRef: params.classRef ?? null,
      })
    ).id,
    existingMessageCount: 0,
  };
}

function toPersistedDelta(params: {
  existingMessageCount: number;
  incomingMessages: ChatMessage[];
  agentMessages: ChatMessage[];
}): ChatMessage[] {
  const incomingNoSystem = nonSystemMessages(params.incomingMessages);
  const incomingDelta = incomingNoSystem.slice(params.existingMessageCount);
  const agentDelta = params.agentMessages.slice(incomingNoSystem.length);

  return [...incomingDelta, ...agentDelta];
}

@Injectable()
export class ChatService {
  async handleChat(
    teacherId: string,
    body: ChatRequestBody,
    request?: Request,
    response?: Response,
  ): Promise<ChatResultPayload | undefined> {
    const limited = checkRateLimit(teacherId);
    if (limited.limited) {
      throwApiError(429, "Rate limited");
    }

    try {
      assertValidProvider(body.provider);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unsupported provider";
      throwApiError(400, message);
    }

    const provider = body.provider as Provider;
    const commandId = body.command?.trim() || undefined;
    if (commandId && !getCommandDefinition(commandId)) {
      throwApiError(400, `Unknown command: ${commandId}`);
    }

    let workspaceContext: Awaited<ReturnType<typeof loadWorkspaceContext>>;
    try {
      workspaceContext = await loadWorkspaceContext({
        teacherId,
        messages: body.messages,
        classRef: body.classRef,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Workspace storage unavailable";
      if (
        message.includes("Workspace storage requires PostgreSQL") ||
        message.includes("workspace_files table is missing")
      ) {
        throwApiError(503, message);
      }
      throwApiError(400, message);
    }

    const memoryContext = await loadMemoryContext({
      teacherId,
      classRef: workspaceContext.classRef,
      maxLines: 200,
    });

    const skillManifest = buildSkillManifestText();
    const toolInstructions = listToolDefinitions()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");

    const { systemPrompt, estimatedTokens } = assembleSystemPrompt({
      assistantIdentity: workspaceContext.assistantIdentity,
      agentInstructions:
        `${DEFAULT_AGENT_INSTRUCTIONS}${commandInstructions(commandId)}`.trim(),
      workspaceContext: workspaceContext.workspaceContextSections,
      teacherMemory: memoryContext.teacherMemory,
      classMemory: memoryContext.classMemory,
      skillManifest,
      toolInstructions: `You have access to the following tools:\n${toolInstructions}`,
    });

    const session = await createSessionIfNeeded({
      teacherId,
      sessionId: body.sessionId,
      provider,
      model: body.model,
      classRef: workspaceContext.classRef,
    });

    if (pendingChatInteractions.has(session.sessionId)) {
      throwApiError(
        409,
        "This session is awaiting an interactive response. Submit that response before sending a new prompt.",
      );
    }

    const modelMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...nonSystemMessages(body.messages),
    ];

    console.info(
      `[prompt] teacher=${teacherId} tokens=${estimatedTokens} classRef=${workspaceContext.classRef ?? "none"}`,
    );

    if (commandId) {
      const incomingDelta = nonSystemMessages(body.messages).slice(
        session.existingMessageCount,
      );
      if (incomingDelta.length > 0) {
        await appendSessionMessages(
          session.sessionId,
          teacherId,
          incomingDelta,
          provider,
          body.model,
          {
            classRef: workspaceContext.classRef,
          },
        );
      }

      const feedforward = feedforwardSummary({
        commandId,
        classRef: workspaceContext.classRef,
        workspacePaths: workspaceContext.loadedPaths,
        memoryPaths: memoryContext.loadedPaths,
      });
      const emptyUsage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
      };
      const trace: ChatTrace = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        systemPrompt,
        estimatedPromptTokens: estimatedTokens,
        usage: emptyUsage,
        status: "success",
        memorySelectionSummary:
          memoryContext.loadedPaths.length > 0
            ? `Loaded memory: ${memoryContext.loadedPaths.join(", ")}`
            : "No memory loaded.",
        steps: [],
      };
      const sessionRecord = await readSession(session.sessionId);
      if (!sessionRecord) {
        throwApiError(404, "Session not found");
      }
      const pausePayload: ChatResultPayload = {
        response: {
          content: "",
          toolCalls: [],
          usage: emptyUsage,
          stopReason: "stop",
        },
        status: "awaiting_feedforward",
        feedforward,
        sessionId: session.sessionId,
        messages: sessionRecord.messages,
        skillsLoaded: sessionRecord.activeSkills ?? [],
        workspaceContextLoaded: workspaceContext.loadedPaths,
        memoryContextLoaded: memoryContext.loadedPaths,
        trace,
      };

      pendingChatInteractions.set(session.sessionId, {
        type: "awaiting_feedforward",
        teacherId,
        loop: {
          teacherId,
          sessionId: session.sessionId,
          provider,
          model: body.model,
          maxTokens: body.maxTokens,
          commandId,
          modelMessages,
          workspaceContext,
          memoryContextLoaded: memoryContext.loadedPaths,
          systemPrompt,
          estimatedTokens,
        },
      });

      if (body.stream) {
        if (!request || !response) {
          throwApiError(500, "Missing request/response for streaming chat");
        }
        response.setHeader("content-type", "text/event-stream");
        response.setHeader("cache-control", "no-cache");
        response.setHeader("connection", "keep-alive");
        response.flushHeaders();
        response.write(sseEvent("start", { ok: true }));
        response.write(
          sseEvent("context", {
            workspaceContextLoaded: workspaceContext.loadedPaths,
            memoryContextLoaded: memoryContext.loadedPaths,
            systemPrompt,
            estimatedPromptTokens: estimatedTokens,
          }),
        );
        response.write(sseEvent("done", pausePayload));
        response.end();
        return;
      }

      return pausePayload;
    }

    if (body.stream) {
      return this.handleStreamingLoop({
        teacherId,
        body,
        request,
        response,
        loop: {
          teacherId,
          sessionId: session.sessionId,
          provider,
          model: body.model,
          maxTokens: body.maxTokens,
          commandId,
          modelMessages,
          workspaceContext,
          memoryContextLoaded: memoryContext.loadedPaths,
          systemPrompt,
          estimatedTokens,
        },
        incomingMessages: body.messages,
        existingMessageCount: session.existingMessageCount,
      });
    }

    return this.handleNonStreamingLoop({
      body,
      loop: {
        teacherId,
        sessionId: session.sessionId,
        provider,
        model: body.model,
        maxTokens: body.maxTokens,
        commandId,
        modelMessages,
        workspaceContext,
        memoryContextLoaded: memoryContext.loadedPaths,
        systemPrompt,
        estimatedTokens,
      },
      incomingMessages: body.messages,
      existingMessageCount: session.existingMessageCount,
    });
  }

  async handleFeedforwardResponse(
    teacherId: string,
    body: FeedforwardResponseBody,
  ): Promise<ChatResultPayload> {
    const pending = pendingChatInteractions.get(body.sessionId);
    if (!pending || pending.teacherId !== teacherId) {
      throwApiError(404, "No pending feedforward state for this session");
    }
    if (pending.type !== "awaiting_feedforward") {
      throwApiError(
        409,
        `Session is awaiting ${pending.type.replace("awaiting_", "")}, not feedforward`,
      );
    }

    pendingChatInteractions.delete(body.sessionId);

    const session = await readSession(body.sessionId);
    if (!session || session.teacherId !== teacherId) {
      throwApiError(404, "Session not found");
    }

    const adjustedMessages = [...pending.loop.modelMessages];
    const note = body.note?.trim();

    if (body.action === "edit" && note) {
      adjustedMessages.push({
        role: "user",
        content: `Feedforward edits from teacher: ${note}`,
      });
    }
    if (body.action === "dismiss") {
      adjustedMessages.push({
        role: "user",
        content:
          "Proceed without inferred context assumptions from feedforward unless explicitly requested.",
      });
      if (note) {
        adjustedMessages.push({
          role: "user",
          content: `Additional guidance: ${note}`,
        });
      }
    }

    return this.handleNonStreamingLoop({
      body: {
        messages: session.messages,
        provider: pending.loop.provider,
        model: pending.loop.model,
        sessionId: pending.loop.sessionId,
        command: pending.loop.commandId,
      },
      loop: {
        ...pending.loop,
        modelMessages: adjustedMessages,
      },
      incomingMessages: session.messages,
      existingMessageCount: session.messages.length,
      commandHooksEnabled: true,
    });
  }

  async handleAdjudicationResponse(
    teacherId: string,
    body: AdjudicationResponseBody,
  ): Promise<ChatResultPayload> {
    const pending = pendingChatInteractions.get(body.sessionId);
    if (!pending || pending.teacherId !== teacherId) {
      throwApiError(404, "No pending adjudication state for this session");
    }

    if (pending.type === "awaiting_reflection") {
      if (body.action !== "acknowledge" && body.action !== "skip") {
        throwApiError(
          400,
          "Expected acknowledge or skip while awaiting reflection",
        );
      }
      pendingChatInteractions.set(body.sessionId, {
        ...pending,
        type: "awaiting_adjudication",
      });
      return {
        ...pending.finalPayload,
        status: "awaiting_adjudication",
        reflection: pending.reflection,
        adjudication: pending.adjudication,
      };
    }

    if (pending.type !== "awaiting_adjudication") {
      throwApiError(
        409,
        `Session is awaiting ${pending.type.replace("awaiting_", "")}, not adjudication`,
      );
    }

    if (body.action === "accept") {
      pendingChatInteractions.delete(body.sessionId);
      return pending.finalPayload;
    }

    if (body.action !== "revise" && body.action !== "alternatives") {
      throwApiError(
        400,
        "Expected accept, revise, or alternatives while awaiting adjudication",
      );
    }

    pendingChatInteractions.delete(body.sessionId);

    const session = await readSession(body.sessionId);
    if (!session || session.teacherId !== teacherId) {
      throwApiError(404, "Session not found");
    }

    const modePrompt =
      body.action === "revise"
        ? "Teacher requested revisions. Revise the most recent output."
        : "Teacher requested alternatives. Provide 2 distinct alternatives.";
    const note = body.note?.trim();

    const resumeMessages: ChatMessage[] = [
      { role: "system", content: pending.loop.systemPrompt },
      ...session.messages,
      { role: "user", content: note ? `${modePrompt}\n\n${note}` : modePrompt },
    ];

    return this.handleNonStreamingLoop({
      body: {
        messages: session.messages,
        provider: pending.loop.provider,
        model: pending.loop.model,
        sessionId: pending.loop.sessionId,
      },
      loop: {
        ...pending.loop,
        commandId: undefined,
        modelMessages: resumeMessages,
      },
      incomingMessages: session.messages,
      existingMessageCount: session.messages.length,
      commandHooksEnabled: false,
    });
  }

  async handleQuestionResponse(
    teacherId: string,
    body: QuestionResponseBody,
  ): Promise<ChatResultPayload> {
    const pending = pendingChatInteractions.get(body.sessionId);
    if (!pending || pending.teacherId !== teacherId) {
      throwApiError(404, "No pending user question state for this session");
    }
    if (pending.type !== "awaiting_user_question") {
      throwApiError(
        409,
        `Session is awaiting ${pending.type.replace("awaiting_", "")}, not user question`,
      );
    }

    const answer = body.answer.trim();
    if (!answer) {
      throwApiError(400, "answer is required");
    }

    const options = pending.pendingQuestion.options ?? [];
    if (
      !pending.pendingQuestion.allowFreeText &&
      options.length > 0 &&
      !options.includes(answer)
    ) {
      throwApiError(400, "Answer must match one of the provided options");
    }

    pendingChatInteractions.delete(body.sessionId);

    const session = await readSession(body.sessionId);
    if (!session || session.teacherId !== teacherId) {
      throwApiError(404, "Session not found");
    }

    const resumedMessages: ChatMessage[] = [
      ...pending.loop.modelMessages,
      {
        role: "tool",
        toolCallId: pending.pendingQuestion.toolCallId,
        toolName: "ask_user_question",
        toolInput: pending.pendingQuestion.toolInput,
        content: answer,
      },
    ];

    return this.handleNonStreamingLoop({
      body: {
        messages: session.messages,
        provider: pending.loop.provider,
        model: pending.loop.model,
        sessionId: pending.loop.sessionId,
        command: pending.loop.commandId,
      },
      loop: {
        ...pending.loop,
        modelMessages: resumedMessages,
      },
      incomingMessages: session.messages,
      existingMessageCount: session.messages.length,
      commandHooksEnabled: Boolean(pending.loop.commandId),
    });
  }

  async handleMemoryResponse(
    teacherId: string,
    body: MemoryResponseBody,
  ): Promise<{ ok: true; confirmed: number; dismissed: number }> {
    const session = await readSession(body.sessionId);
    if (!session || session.teacherId !== teacherId) {
      throwApiError(404, "Session not found");
    }

    let confirmed = 0;
    let dismissed = 0;

    for (const item of body.decisions ?? []) {
      if (item.decision === "dismiss") {
        dismissed += 1;
        continue;
      }

      const result = await appendCategorizedMemoryEntry({
        teacherId,
        scope: item.scope,
        classId: item.classId,
        category: resolveDecisionCategory(item),
        text: item.text,
        sessionId: body.sessionId,
      });

      if (result.inserted) {
        confirmed += 1;
      }
    }

    return {
      ok: true,
      confirmed,
      dismissed,
    };
  }

  private async handleStreamingLoop(params: {
    teacherId: string;
    body: ChatRequestBody;
    request?: Request;
    response?: Response;
    loop: LoopContext;
    incomingMessages: ChatMessage[];
    existingMessageCount: number;
    commandHooksEnabled?: boolean;
  }): Promise<undefined> {
    if (!params.request || !params.response) {
      throwApiError(500, "Missing request/response for streaming chat");
    }

    const { request, response } = params;
    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    response.write(sseEvent("start", { ok: true }));
    response.write(
      sseEvent("context", {
        workspaceContextLoaded: params.loop.workspaceContext.loadedPaths,
        memoryContextLoaded: params.loop.memoryContextLoaded,
        systemPrompt: params.loop.systemPrompt,
        estimatedPromptTokens: params.loop.estimatedTokens,
      }),
    );

    let closed = false;
    request.on("close", () => {
      closed = true;
    });

    const heartbeat = setInterval(() => {
      if (!closed) {
        response.write(sseEvent("ping", { t: Date.now() }));
      }
    }, 5000);

    try {
      let lastAssistantSnapshot = "";

      let agentResult: Awaited<ReturnType<typeof runAgentLoopStreaming>>;
      try {
        agentResult = await runAgentLoopStreaming({
          teacherId: params.teacherId,
          sessionId: params.loop.sessionId,
          provider: params.loop.provider,
          model: params.loop.model,
          messages: params.loop.modelMessages,
          maxTokens: params.loop.maxTokens,
          shouldStop: () => closed,
          chunkAssistantText: streamChunks,
          onEvent: async (event) => {
            if (closed) {
              return;
            }

            if (event.message.role === "assistant") {
              const fullText = event.message.content;
              const delta = fullText.startsWith(lastAssistantSnapshot)
                ? fullText.slice(lastAssistantSnapshot.length)
                : fullText;
              lastAssistantSnapshot = fullText;
              if (delta) {
                response.write(
                  sseEvent("delta", {
                    text: delta,
                  }),
                );
              }
              return;
            }

            lastAssistantSnapshot = "";
            response.write(sseEvent("message", { message: event.message }));
          },
        });
      } catch (error) {
        if (error instanceof ModelConfigurationError) {
          throwApiError(400, error.message);
        }
        const message =
          error instanceof Error ? error.message : "Model request failed";
        throwApiError(502, message);
      }

      const payload = await this.buildPayloadFromAgentResult({
        body: params.body,
        loop: params.loop,
        incomingMessages: params.incomingMessages,
        existingMessageCount: params.existingMessageCount,
        agentMessages: agentResult.messages,
        usage: agentResult.usage,
        status: agentResult.status,
        skillsLoaded: agentResult.skillsLoaded,
        pendingQuestion: agentResult.pendingQuestion,
        commandHooksEnabled: params.commandHooksEnabled,
      });

      if (!closed) {
        response.write(sseEvent("done", payload));
      }
    } finally {
      clearInterval(heartbeat);
      response.end();
    }

    return;
  }

  private async handleNonStreamingLoop(params: {
    body: ChatRequestBody;
    loop: LoopContext;
    incomingMessages: ChatMessage[];
    existingMessageCount: number;
    commandHooksEnabled?: boolean;
  }): Promise<ChatResultPayload> {
    let agentResult: Awaited<ReturnType<typeof runAgentLoop>>;
    try {
      agentResult = await runAgentLoop({
        teacherId: params.loop.teacherId,
        sessionId: params.loop.sessionId,
        provider: params.loop.provider,
        model: params.loop.model,
        messages: params.loop.modelMessages,
        maxTokens: params.loop.maxTokens,
      });
    } catch (error) {
      if (error instanceof ModelConfigurationError) {
        throwApiError(400, error.message);
      }
      const message =
        error instanceof Error ? error.message : "Model request failed";
      throwApiError(502, message);
    }

    return this.buildPayloadFromAgentResult({
      body: params.body,
      loop: params.loop,
      incomingMessages: params.incomingMessages,
      existingMessageCount: params.existingMessageCount,
      agentMessages: agentResult.messages,
      usage: agentResult.usage,
      status: agentResult.status,
      skillsLoaded: agentResult.skillsLoaded,
      pendingQuestion: agentResult.pendingQuestion,
      commandHooksEnabled: params.commandHooksEnabled,
    });
  }

  private async buildPayloadFromAgentResult(params: {
    body: ChatRequestBody;
    loop: LoopContext;
    incomingMessages: ChatMessage[];
    existingMessageCount: number;
    agentMessages: ChatMessage[];
    usage: TokenUsage;
    status:
      | "success"
      | "error_max_turns"
      | "error_max_budget"
      | "awaiting_user_question";
    skillsLoaded: string[];
    pendingQuestion?: AgentQuestionPayload;
    commandHooksEnabled?: boolean;
  }): Promise<ChatResultPayload> {
    if (params.status === "error_max_turns") {
      throwApiError(400, "Agent exceeded max turns");
    }

    if (params.status === "error_max_budget") {
      throwApiError(400, "Agent exceeded max budget");
    }

    const deltaMessages = toPersistedDelta({
      existingMessageCount: params.existingMessageCount,
      incomingMessages: params.incomingMessages,
      agentMessages: params.agentMessages,
    });

    const finalAssistant =
      [...params.agentMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.content ?? "";

    const trace: ChatTrace = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      systemPrompt: params.loop.systemPrompt,
      estimatedPromptTokens: params.loop.estimatedTokens,
      usage: params.usage,
      status: "success",
      memorySelectionSummary:
        params.loop.memoryContextLoaded.length > 0
          ? `Loaded memory: ${params.loop.memoryContextLoaded.join(", ")}`
          : "No memory loaded.",
      steps: params.agentMessages
        .filter((message) => message.role === "tool")
        .map((message) => ({
          toolName: message.toolName ?? "tool",
          input: message.toolInput ?? {},
          output: message.content,
          isError: Boolean(message.toolError),
        })),
    };

    const persisted = await appendSessionMessages(
      params.loop.sessionId,
      params.loop.teacherId,
      deltaMessages,
      params.loop.provider,
      params.loop.model,
      {
        trace,
        classRef: params.loop.workspaceContext.classRef,
        contextPaths: params.loop.workspaceContext.loadedPaths,
        memoryContextPaths: params.loop.memoryContextLoaded,
        activeSkills: params.skillsLoaded,
      },
    );

    if (!persisted) {
      throwApiError(404, "Session not found");
    }

    if (params.status === "awaiting_user_question") {
      const payload: ChatResultPayload = {
        response: {
          content: finalAssistant,
          toolCalls: [],
          usage: params.usage,
          stopReason: "stop",
        },
        status: "awaiting_user_question",
        question: {
          question: params.pendingQuestion?.question ?? "",
          options: params.pendingQuestion?.options,
          allow_free_text: params.pendingQuestion?.allowFreeText ?? false,
        },
        sessionId: params.loop.sessionId,
        messages: persisted.messages,
        skillsLoaded: params.skillsLoaded,
        workspaceContextLoaded: params.loop.workspaceContext.loadedPaths,
        memoryContextLoaded: params.loop.memoryContextLoaded,
        trace,
      };

      if (params.pendingQuestion) {
        pendingChatInteractions.set(params.loop.sessionId, {
          type: "awaiting_user_question",
          teacherId: params.loop.teacherId,
          loop: params.loop,
          pendingQuestion: params.pendingQuestion,
        });
      }

      return payload;
    }

    let proposals: MemoryProposal[] = [];
    try {
      proposals = await extractNovelMemoryProposals({
        teacherId: params.loop.teacherId,
        provider: params.loop.provider,
        model: params.loop.model,
        classRef: params.loop.workspaceContext.classRef,
        latestUserMessage: latestUserMessage(params.incomingMessages),
        finalAssistantMessage: finalAssistant,
        recentMessages: params.agentMessages,
      });
    } catch (error) {
      console.warn("[memory] proposal extraction failed:", error);
      proposals = [];
    }

    const memoryStatus =
      proposals.length > 0 ? "awaiting_memory_capture" : "no_new_memory";

    const finalPayload: ChatResultPayload = {
      response: {
        content: finalAssistant,
        toolCalls: [],
        usage: params.usage,
        stopReason: "stop",
      },
      status: memoryStatus,
      proposals: proposals.length > 0 ? proposals : undefined,
      sessionId: params.loop.sessionId,
      messages: persisted.messages,
      skillsLoaded: params.skillsLoaded,
      workspaceContextLoaded: params.loop.workspaceContext.loadedPaths,
      memoryContextLoaded: params.loop.memoryContextLoaded,
      trace,
    };

    if (!params.commandHooksEnabled || !params.loop.commandId) {
      return finalPayload;
    }

    const reflection: ReflectionPayload = {
      prompt:
        "Before finalizing, does this output align with your intended outcomes, class needs, and success criteria?",
    };
    const adjudication = parseHeadingSections(finalAssistant);
    const paused: ChatResultPayload = {
      ...finalPayload,
      status: "awaiting_reflection",
      reflection,
      adjudication,
    };

    pendingChatInteractions.set(params.loop.sessionId, {
      type: "awaiting_reflection",
      teacherId: params.loop.teacherId,
      commandId: params.loop.commandId,
      loop: params.loop,
      finalPayload,
      reflection,
      adjudication,
    });

    return paused;
  }
}
