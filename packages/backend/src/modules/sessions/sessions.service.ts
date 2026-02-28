import { Injectable } from "@nestjs/common";

import { throwApiError } from "../../common/api-error";
import { assertValidProvider } from "../../model";
import {
  appendSessionMessages,
  createSession,
  deleteSession,
  listSessions,
  readSession,
} from "../../store";
import type { ChatMessage, Provider } from "../../types";

@Injectable()
export class SessionsService {
  create(params: {
    teacherId: string;
    provider: string;
    model: string;
    messages?: ChatMessage[];
  }) {
    try {
      assertValidProvider(params.provider);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unsupported provider";
      throwApiError(400, message);
    }

    return createSession({
      teacherId: params.teacherId,
      provider: params.provider as Provider,
      model: params.model,
      messages: params.messages,
    });
  }

  list(teacherId: string) {
    return listSessions(teacherId);
  }

  read(sessionId: string, teacherId: string) {
    const session = readSession(sessionId);
    if (!session || session.teacherId !== teacherId) {
      throwApiError(404, "Session not found");
    }
    return session;
  }

  update(params: {
    sessionId: string;
    teacherId: string;
    messages: ChatMessage[];
    provider?: string;
    model?: string;
  }) {
    let provider: Provider | undefined;

    if (params.provider) {
      try {
        assertValidProvider(params.provider);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unsupported provider";
        throwApiError(400, message);
      }
      provider = params.provider;
    }

    const updated = appendSessionMessages(
      params.sessionId,
      params.teacherId,
      params.messages,
      provider,
      params.model,
    );

    if (!updated) {
      throwApiError(404, "Session not found");
    }

    return updated;
  }

  remove(sessionId: string, teacherId: string): void {
    const deleted = deleteSession(sessionId, teacherId);
    if (!deleted) {
      throwApiError(404, "Session not found");
    }
  }
}
