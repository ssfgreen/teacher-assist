import { Injectable } from "@nestjs/common";

import { throwApiError } from "../../common/api-error";
import { listSessions, readSession } from "../../store";
import type { ChatTrace, SessionRecord } from "../../types";

export interface TraceDto extends ChatTrace {
  session: {
    id: string;
    provider: string;
    model: string;
    classRef: string | null;
    updatedAt: string;
  };
}

function toTraceDto(trace: ChatTrace, session: SessionRecord): TraceDto {
  return {
    ...trace,
    session: {
      id: session.id,
      provider: session.provider,
      model: session.model,
      classRef: session.classRef ?? null,
      updatedAt: session.updatedAt,
    },
  };
}

function sortNewestFirst(left: ChatTrace, right: ChatTrace): number {
  return right.createdAt.localeCompare(left.createdAt);
}

@Injectable()
export class TracesService {
  async listForTeacher(teacherId: string, limit = 100): Promise<TraceDto[]> {
    const sessions = await listSessions(teacherId);
    const traces = sessions
      .flatMap((session) =>
        (session.traceHistory ?? []).map((trace) => toTraceDto(trace, session)),
      )
      .sort((a, b) => sortNewestFirst(a, b));

    return traces.slice(0, Math.max(1, Math.min(limit, 500)));
  }

  async listForSession(
    sessionId: string,
    teacherId: string,
  ): Promise<TraceDto[]> {
    const session = await readSession(sessionId);
    if (!session || session.teacherId !== teacherId) {
      throwApiError(404, "Session not found");
    }

    return (session.traceHistory ?? [])
      .slice()
      .sort(sortNewestFirst)
      .map((trace) => toTraceDto(trace, session));
  }

  async readById(traceId: string, teacherId: string): Promise<TraceDto> {
    const sessions = await listSessions(teacherId);

    for (const session of sessions) {
      const trace = (session.traceHistory ?? []).find(
        (item) => item.id === traceId,
      );
      if (trace) {
        return toTraceDto(trace, session);
      }
    }

    throwApiError(404, "Trace not found");
  }
}
