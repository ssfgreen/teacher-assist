import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Response } from "express";

import { runAgentLoop } from "../../agent";
import { throwApiError } from "../../common/api-error";
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

async function createSessionIfNeeded(params: {
  teacherId: string;
  sessionId?: string;
  provider: Provider;
  model: string;
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

interface ChatResultPayload {
  response: {
    content: string;
    toolCalls: [];
    usage: TokenUsage;
    stopReason: "stop" | "error";
  };
  sessionId: string;
  messages: ChatMessage[];
  skillsLoaded: string[];
  workspaceContextLoaded: string[];
  trace: ChatTrace;
}

@Injectable()
export class ChatService {
  async handleChat(
    teacherId: string,
    body: ChatRequestBody,
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

    const skillManifest = buildSkillManifestText();
    const toolInstructions = listToolDefinitions()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");

    const { systemPrompt, estimatedTokens } = assembleSystemPrompt({
      assistantIdentity: workspaceContext.assistantIdentity,
      agentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
      workspaceContext: workspaceContext.workspaceContextSections,
      skillManifest,
      toolInstructions: `You have access to the following tools:\n${toolInstructions}`,
    });

    const session = await createSessionIfNeeded({
      teacherId,
      sessionId: body.sessionId,
      provider,
      model: body.model,
    });

    const modelMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...nonSystemMessages(body.messages),
    ];

    console.info(
      `[prompt] teacher=${teacherId} tokens=${estimatedTokens} classRef=${workspaceContext.classRef ?? "none"}`,
    );

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

    if (agentResult.status === "error_max_turns") {
      throwApiError(400, "Agent exceeded max turns");
    }

    if (agentResult.status === "error_max_budget") {
      throwApiError(400, "Agent exceeded max budget");
    }

    const deltaMessages = toPersistedDelta({
      existingMessageCount: session.existingMessageCount,
      incomingMessages: body.messages,
      agentMessages: agentResult.messages,
    });

    const persisted = await appendSessionMessages(
      session.sessionId,
      teacherId,
      deltaMessages,
      provider,
      body.model,
    );

    if (!persisted) {
      throwApiError(404, "Session not found");
    }

    const finalAssistant =
      [...agentResult.messages]
        .reverse()
        .find((message) => message.role === "assistant")?.content ?? "";

    const responsePayload: ChatResultPayload = {
      response: {
        content: finalAssistant,
        toolCalls: [],
        usage: agentResult.usage,
        stopReason: "stop",
      },
      sessionId: session.sessionId,
      messages: persisted.messages,
      skillsLoaded: agentResult.skillsLoaded,
      workspaceContextLoaded: workspaceContext.loadedPaths,
      trace: {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        systemPrompt,
        estimatedPromptTokens: estimatedTokens,
        status: agentResult.status,
        steps: agentResult.messages
          .filter((message) => message.role === "tool")
          .map((message) => ({
            toolName: message.toolName ?? "tool",
            input: message.toolInput ?? {},
            output: message.content,
            isError: Boolean(message.toolError),
          })),
      },
    };

    if (!body.stream) {
      return responsePayload;
    }

    if (!response) {
      throwApiError(500, "Missing response for streaming chat");
    }

    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();

    response.write(sseEvent("start", { ok: true }));

    const heartbeat = setInterval(() => {
      response.write(sseEvent("ping", { t: Date.now() }));
    }, 5000);

    try {
      for (const chunk of streamChunks(finalAssistant)) {
        response.write(sseEvent("delta", { text: chunk }));
      }
      response.write(sseEvent("done", responsePayload));
    } finally {
      clearInterval(heartbeat);
      response.end();
    }

    return;
  }
}
