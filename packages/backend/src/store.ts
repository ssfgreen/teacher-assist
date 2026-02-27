import { randomUUID } from "node:crypto";

import type { ChatMessage, Provider, SessionRecord, Teacher } from "./types";

const teachersByEmail = new Map<string, Teacher>();
const teachersById = new Map<string, Teacher>();
const sessionsById = new Map<string, SessionRecord>();

const authTokens = new Map<string, { teacherId: string; expiresAt: number }>();
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const MAX_REQUESTS_PER_MINUTE = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function upsertTeacher(teacher: Teacher): void {
  teachersByEmail.set(teacher.email.toLowerCase(), teacher);
  teachersById.set(teacher.id, teacher);
}

export function getTeacherByEmail(email: string): Teacher | null {
  return teachersByEmail.get(email.toLowerCase()) ?? null;
}

export function getTeacherById(id: string): Teacher | null {
  return teachersById.get(id) ?? null;
}

export function createAuthToken(teacherId: string): string {
  const token = randomUUID();
  authTokens.set(token, {
    teacherId,
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS,
  });
  return token;
}

export function readAuthToken(token: string): string | null {
  const record = authTokens.get(token);
  if (!record) {
    return null;
  }
  if (record.expiresAt < Date.now()) {
    authTokens.delete(token);
    return null;
  }
  return record.teacherId;
}

export function revokeAuthToken(token: string): void {
  authTokens.delete(token);
}

export function checkRateLimit(teacherId: string): {
  limited: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const existing = rateLimitMap.get(teacherId);
  if (!existing || existing.resetAt < now) {
    rateLimitMap.set(teacherId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { limited: false };
  }

  if (existing.count >= MAX_REQUESTS_PER_MINUTE) {
    return {
      limited: true,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { limited: false };
}

export function createSession(params: {
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

export function listSessions(teacherId: string): SessionRecord[] {
  return [...sessionsById.values()]
    .filter((session) => session.teacherId === teacherId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readSession(id: string): SessionRecord | null {
  return sessionsById.get(id) ?? null;
}

export function appendSessionMessages(
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

export function deleteSession(id: string, teacherId: string): boolean {
  const existing = sessionsById.get(id);
  if (!existing || existing.teacherId !== teacherId) {
    return false;
  }
  sessionsById.delete(id);
  return true;
}

export function resetStores(): void {
  teachersByEmail.clear();
  teachersById.clear();
  sessionsById.clear();
  authTokens.clear();
  rateLimitMap.clear();
}
