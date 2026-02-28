import { randomUUID } from "node:crypto";

import type { ChatMessage, Provider, SessionRecord } from "../types";
import { sessionsById } from "./state";

export function createSessionInMemory(params: {
  teacherId: string;
  provider: Provider;
  model: string;
  messages?: ChatMessage[];
}): SessionRecord {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: randomUUID(),
    teacherId: params.teacherId,
    provider: params.provider,
    model: params.model,
    messages: params.messages ?? [],
    createdAt: now,
    updatedAt: now,
  };
  sessionsById.set(session.id, session);
  return session;
}

export function listSessionsByTeacher(teacherId: string): SessionRecord[] {
  return [...sessionsById.values()]
    .filter((session) => session.teacherId === teacherId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readSession(id: string): SessionRecord | null {
  return sessionsById.get(id) ?? null;
}

export function appendSessionMessagesInMemory(
  id: string,
  teacherId: string,
  messages: ChatMessage[],
  provider?: Provider,
  model?: string,
): SessionRecord | null {
  const existing = sessionsById.get(id);
  if (!existing || existing.teacherId !== teacherId) {
    return null;
  }

  existing.messages = [...existing.messages, ...messages];
  if (provider) {
    existing.provider = provider;
  }
  if (model) {
    existing.model = model;
  }
  existing.updatedAt = new Date().toISOString();
  return existing;
}

export function deleteSessionInMemory(id: string, teacherId: string): boolean {
  const existing = sessionsById.get(id);
  if (!existing || existing.teacherId !== teacherId) {
    return false;
  }
  sessionsById.delete(id);
  return true;
}
