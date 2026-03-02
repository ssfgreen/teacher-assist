import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Request, Response } from "express";

import { runAgentLoop, runAgentLoopStreaming } from "../../agent";
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

export interface ChatRequestBody {
  messages: ChatMessage[];
  provider: string;
  model: string;
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

interface ChatResultPayload {
  response: {
    content: string;
    toolCalls: [];
    usage: TokenUsage;
    stopReason: "stop" | "error";
  };
  status: "success" | "awaiting_memory_capture" | "no_new_memory";
  proposals?: MemoryProposal[];
  sessionId: string;
  messages: ChatMessage[];
  skillsLoaded: string[];
  workspaceContextLoaded: string[];
  memoryContextLoaded: string[];
  trace: ChatTrace;
}

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
      agentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
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

    const modelMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...nonSystemMessages(body.messages),
    ];

    console.info(
      `[prompt] teacher=${teacherId} tokens=${estimatedTokens} classRef=${workspaceContext.classRef ?? "none"}`,
    );

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
            teacherId,
            sessionId: session.sessionId,
            provider,
            model: body.model,
            messages: modelMessages,
            maxTokens: body.maxTokens,
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

        const payload = await this.finalizeChatResult({
          teacherId,
          body,
          workspaceContext,
          memoryContextLoaded: memoryContext.loadedPaths,
          sessionId: session.sessionId,
          existingMessageCount: session.existingMessageCount,
          systemPrompt,
          estimatedTokens,
          agentMessages: agentResult.messages,
          usage: agentResult.usage,
          status: agentResult.status,
          skillsLoaded: agentResult.skillsLoaded,
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

    let agentResult: Awaited<ReturnType<typeof runAgentLoop>>;
    try {
      agentResult = await runAgentLoop({
        teacherId,
        sessionId: session.sessionId,
        provider,
        model: body.model,
        messages: modelMessages,
        maxTokens: body.maxTokens,
      });
    } catch (error) {
      if (error instanceof ModelConfigurationError) {
        throwApiError(400, error.message);
      }
      const message =
        error instanceof Error ? error.message : "Model request failed";
      throwApiError(502, message);
    }

    return this.finalizeChatResult({
      teacherId,
      body,
      workspaceContext,
      memoryContextLoaded: memoryContext.loadedPaths,
      sessionId: session.sessionId,
      existingMessageCount: session.existingMessageCount,
      systemPrompt,
      estimatedTokens,
      agentMessages: agentResult.messages,
      usage: agentResult.usage,
      status: agentResult.status,
      skillsLoaded: agentResult.skillsLoaded,
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

  private async finalizeChatResult(params: {
    teacherId: string;
    body: ChatRequestBody;
    workspaceContext: Awaited<ReturnType<typeof loadWorkspaceContext>>;
    memoryContextLoaded: string[];
    sessionId: string;
    existingMessageCount: number;
    systemPrompt: string;
    estimatedTokens: number;
    agentMessages: ChatMessage[];
    usage: TokenUsage;
    status: "success" | "error_max_turns" | "error_max_budget";
    skillsLoaded: string[];
  }): Promise<ChatResultPayload> {
    if (params.status === "error_max_turns") {
      throwApiError(400, "Agent exceeded max turns");
    }

    if (params.status === "error_max_budget") {
      throwApiError(400, "Agent exceeded max budget");
    }

    const deltaMessages = toPersistedDelta({
      existingMessageCount: params.existingMessageCount,
      incomingMessages: params.body.messages,
      agentMessages: params.agentMessages,
    });

    const finalAssistant =
      [...params.agentMessages]
        .reverse()
        .find((message) => message.role === "assistant")?.content ?? "";

    const trace: ChatTrace = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      systemPrompt: params.systemPrompt,
      estimatedPromptTokens: params.estimatedTokens,
      usage: params.usage,
      status: params.status,
      memorySelectionSummary:
        params.memoryContextLoaded.length > 0
          ? `Loaded memory: ${params.memoryContextLoaded.join(", ")}`
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
      params.sessionId,
      params.teacherId,
      deltaMessages,
      params.body.provider as Provider,
      params.body.model,
      {
        trace,
        classRef: params.workspaceContext.classRef,
        contextPaths: params.workspaceContext.loadedPaths,
        memoryContextPaths: params.memoryContextLoaded,
        activeSkills: params.skillsLoaded,
      },
    );

    if (!persisted) {
      throwApiError(404, "Session not found");
    }

    let proposals: MemoryProposal[] = [];
    try {
      proposals = await extractNovelMemoryProposals({
        teacherId: params.teacherId,
        provider: params.body.provider as Provider,
        model: params.body.model,
        classRef: params.workspaceContext.classRef,
        latestUserMessage: latestUserMessage(params.body.messages),
        finalAssistantMessage: finalAssistant,
        recentMessages: params.agentMessages,
      });
    } catch (error) {
      console.warn("[memory] proposal extraction failed:", error);
      proposals = [];
    }

    const status =
      proposals.length > 0 ? "awaiting_memory_capture" : "no_new_memory";

    return {
      response: {
        content: finalAssistant,
        toolCalls: [],
        usage: params.usage,
        stopReason: "stop",
      },
      status,
      proposals: proposals.length > 0 ? proposals : undefined,
      sessionId: params.sessionId,
      messages: persisted.messages,
      skillsLoaded: params.skillsLoaded,
      workspaceContextLoaded: params.workspaceContext.loadedPaths,
      memoryContextLoaded: params.memoryContextLoaded,
      trace,
    };
  }
}
