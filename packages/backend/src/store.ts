import {
  createAuthToken,
  readAuthToken,
  revokeAuthToken,
} from "./store/auth-tokens";
import { readStoreFromDisk, writeStoreToDisk } from "./store/persistence";
import { checkRateLimit } from "./store/rate-limit";
import {
  appendSessionMessagesInMemory,
  createSessionInMemory,
  deleteSessionInMemory,
  listSessionsByTeacher,
  readSession,
} from "./store/sessions";
import {
  authTokens,
  rateLimitMap,
  sessionsById,
  teachersByEmail,
  teachersById,
} from "./store/state";
import {
  getTeacherByEmail,
  getTeacherById,
  upsertTeacherInMemory,
} from "./store/teachers";
import type { ChatMessage, Provider, SessionRecord, Teacher } from "./types";

function persistStore(): void {
  writeStoreToDisk({
    teachers: [...teachersById.values()],
    sessions: [...sessionsById.values()],
  });
}

function hydrateStoreFromDisk(): void {
  const persisted = readStoreFromDisk();

  teachersByEmail.clear();
  teachersById.clear();
  sessionsById.clear();

  for (const teacher of persisted.teachers) {
    upsertTeacherInMemory(teacher);
  }

  for (const session of persisted.sessions) {
    sessionsById.set(session.id, session);
  }
}

hydrateStoreFromDisk();

export function upsertTeacher(teacher: Teacher): void {
  upsertTeacherInMemory(teacher);
  persistStore();
}

export {
  getTeacherByEmail,
  getTeacherById,
  createAuthToken,
  readAuthToken,
  revokeAuthToken,
  checkRateLimit,
  readSession,
};

export function createSession(params: {
  teacherId: string;
  provider: Provider;
  model: string;
  messages?: ChatMessage[];
}): SessionRecord {
  const session = createSessionInMemory(params);
  persistStore();
  return session;
}

export function listSessions(teacherId: string): SessionRecord[] {
  return listSessionsByTeacher(teacherId);
}

export function appendSessionMessages(
  id: string,
  teacherId: string,
  messages: ChatMessage[],
  provider?: Provider,
  model?: string,
): SessionRecord | null {
  const updated = appendSessionMessagesInMemory(
    id,
    teacherId,
    messages,
    provider,
    model,
  );
  if (updated) {
    persistStore();
  }
  return updated;
}

export function deleteSession(id: string, teacherId: string): boolean {
  const deleted = deleteSessionInMemory(id, teacherId);
  if (deleted) {
    persistStore();
  }
  return deleted;
}

export function resetStores(): void {
  teachersByEmail.clear();
  teachersById.clear();
  sessionsById.clear();
  authTokens.clear();
  rateLimitMap.clear();
  persistStore();
}
