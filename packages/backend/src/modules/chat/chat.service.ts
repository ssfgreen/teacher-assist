import { Injectable } from "@nestjs/common";
import type { Response } from "express";

import { throwApiError } from "../../common/api-error";
import {
  ModelConfigurationError,
  assertValidProvider,
  callModel,
  streamModel,
} from "../../model";
import { DEFAULT_AGENT_INSTRUCTIONS, assembleSystemPrompt } from "../../prompt";
import {
  appendSessionMessages,
  checkRateLimit,
  createSession,
} from "../../store";
import type { ChatMessage, ModelResponse, Provider } from "../../types";
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

function buildAssistantMessages(
  existingMessages: ChatMessage[],
  assistantContent: string,
): ChatMessage[] {
  const userAndAssistantMessages: ChatMessage[] = [];
  const lastUserMessage = [...existingMessages]
    .reverse()
    .find((message) => message.role === "user");

  if (lastUserMessage) {
    userAndAssistantMessages.push(lastUserMessage);
  }

  userAndAssistantMessages.push({
    role: "assistant",
    content: assistantContent,
  });

  return userAndAssistantMessages;
}

function persistChatResult(params: {
  teacherId: string;
  sessionId?: string;
  provider: Provider;
  model: string;
  sourceMessages: ChatMessage[];
  assistantContent: string;
}): { sessionId: string } | { error: "Session not found" } {
  const messagesToAppend = buildAssistantMessages(
    params.sourceMessages,
    params.assistantContent,
  );

  if (params.sessionId) {
    const updated = appendSessionMessages(
      params.sessionId,
      params.teacherId,
      messagesToAppend,
      params.provider,
      params.model,
    );

    if (!updated) {
      return { error: "Session not found" };
    }

    return { sessionId: params.sessionId };
  }

  const created = createSession({
    teacherId: params.teacherId,
    provider: params.provider,
    model: params.model,
    messages: messagesToAppend,
  });

  return { sessionId: created.id };
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

@Injectable()
export class ChatService {
  async handleChat(
    teacherId: string,
    body: ChatRequestBody,
    response?: Response,
  ): Promise<
    | {
        response: ModelResponse;
        sessionId: string;
        workspaceContextLoaded: string[];
      }
    | undefined
  > {
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

    const { systemPrompt, estimatedTokens } = assembleSystemPrompt({
      assistantIdentity: workspaceContext.assistantIdentity,
      agentInstructions: DEFAULT_AGENT_INSTRUCTIONS,
      workspaceContext: workspaceContext.workspaceContextSections,
    });

    const modelMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...body.messages.filter((message) => message.role !== "system"),
    ];

    console.info(
      `[prompt] teacher=${teacherId} tokens=${estimatedTokens} classRef=${workspaceContext.classRef ?? "none"}`,
    );

    if (body.stream) {
      if (!response) {
        throwApiError(500, "Missing response for streaming chat");
      }

      response.setHeader("content-type", "text/event-stream");
      response.setHeader("cache-control", "no-cache");
      response.setHeader("connection", "keep-alive");
      response.flushHeaders();

      const pushEvent = (event: string, payload: unknown) => {
        response.write(sseEvent(event, payload));
      };

      pushEvent("start", { ok: true });

      const heartbeat = setInterval(() => {
        pushEvent("ping", { t: Date.now() });
      }, 5000);

      try {
        const streamedResponse = await streamModel(
          provider,
          body.model,
          modelMessages,
          (delta) => {
            pushEvent("delta", { text: delta });
          },
          body.maxTokens,
        );

        const persisted = persistChatResult({
          teacherId,
          sessionId: body.sessionId,
          provider,
          model: body.model,
          sourceMessages: body.messages,
          assistantContent: streamedResponse.content,
        });

        if ("error" in persisted) {
          pushEvent("error", { error: persisted.error });
          return;
        }

        pushEvent("done", {
          response: streamedResponse,
          sessionId: persisted.sessionId,
          workspaceContextLoaded: workspaceContext.loadedPaths,
        });
      } catch (error) {
        if (error instanceof ModelConfigurationError) {
          pushEvent("error", { error: error.message });
        } else {
          const message =
            error instanceof Error ? error.message : "Model request failed";
          pushEvent("error", { error: message });
        }
      } finally {
        clearInterval(heartbeat);
        response.end();
      }

      return;
    }

    let modelResponse: ModelResponse;
    try {
      modelResponse = await callModel(
        provider,
        body.model,
        modelMessages,
        body.maxTokens,
      );
    } catch (error) {
      if (error instanceof ModelConfigurationError) {
        throwApiError(400, error.message);
      }
      const message =
        error instanceof Error ? error.message : "Model request failed";
      throwApiError(502, message);
    }

    const persisted = persistChatResult({
      teacherId,
      sessionId: body.sessionId,
      provider,
      model: body.model,
      sourceMessages: body.messages,
      assistantContent: modelResponse.content,
    });

    if ("error" in persisted) {
      throwApiError(404, persisted.error);
    }

    return {
      response: modelResponse,
      sessionId: persisted.sessionId,
      workspaceContextLoaded: workspaceContext.loadedPaths,
    };
  }
}
