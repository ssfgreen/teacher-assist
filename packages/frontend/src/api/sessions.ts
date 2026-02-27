import type { ChatMessage, Provider, SessionRecord } from "../types";
import { apiFetch } from "./client";

export async function createSession(
  provider: Provider,
  model: string,
): Promise<SessionRecord> {
  return apiFetch<SessionRecord>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ provider, model }),
  });
}

export async function listSessions(): Promise<SessionRecord[]> {
  return apiFetch<SessionRecord[]>("/api/sessions");
}

export async function readSession(id: string): Promise<SessionRecord> {
  return apiFetch<SessionRecord>(`/api/sessions/${id}`);
}

export async function appendSession(
  id: string,
  messages: ChatMessage[],
): Promise<SessionRecord> {
  return apiFetch<SessionRecord>(`/api/sessions/${id}`, {
    method: "PUT",
    body: JSON.stringify({ messages }),
  });
}

export async function removeSession(id: string): Promise<void> {
  await apiFetch<never>(`/api/sessions/${id}`, {
    method: "DELETE",
  });
}
