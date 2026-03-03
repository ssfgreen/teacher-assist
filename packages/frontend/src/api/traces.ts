import type { TraceRecord } from "../types";
import { apiFetch } from "./client";

export async function listTraces(params?: {
  sessionId?: string;
  limit?: number;
}): Promise<{ traces: TraceRecord[] }> {
  const search = new URLSearchParams();
  if (params?.sessionId) {
    search.set("sessionId", params.sessionId);
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }

  const suffix = search.toString();
  return apiFetch<{ traces: TraceRecord[] }>(
    `/api/traces${suffix ? `?${suffix}` : ""}`,
  );
}

export async function listSessionTraces(
  sessionId: string,
): Promise<{ traces: TraceRecord[] }> {
  return apiFetch<{ traces: TraceRecord[] }>(
    `/api/sessions/${encodeURIComponent(sessionId)}/traces`,
  );
}

export async function readTrace(traceId: string): Promise<TraceRecord> {
  return apiFetch<TraceRecord>(`/api/traces/${encodeURIComponent(traceId)}`);
}
