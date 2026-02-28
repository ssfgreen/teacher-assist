import { getDataSource } from "./db";
import {
  createAuthToken,
  readAuthToken,
  revokeAuthToken,
} from "./store/auth-tokens";
import { checkRateLimit } from "./store/rate-limit";
import { authTokens, rateLimitMap } from "./store/state";
import { SessionEntity } from "./typeorm/entities/session.entity";
import { TeacherEntity } from "./typeorm/entities/teacher.entity";
import type {
  ChatMessage,
  ChatTrace,
  Provider,
  SessionRecord,
  SessionTask,
  Teacher,
} from "./types";

function parseArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toSessionRecord(entity: SessionEntity): SessionRecord {
  return {
    id: entity.id,
    teacherId: entity.teacherId,
    provider: entity.provider as Provider,
    model: entity.model,
    messages: parseArray<ChatMessage>(entity.messages),
    tasks: parseArray<SessionTask>(entity.tasks),
    traceHistory: parseArray<ChatTrace>(entity.traceHistory),
    contextHistory: parseArray<string[]>(entity.contextHistory),
    activeSkills: parseArray<string>(entity.activeSkills),
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toTeacher(entity: TeacherEntity): Teacher {
  return {
    id: entity.id,
    email: entity.email,
    name: entity.name,
    passwordHash: entity.passwordHash,
  };
}

export { createAuthToken, readAuthToken, revokeAuthToken, checkRateLimit };

export async function upsertTeacher(teacher: Teacher): Promise<void> {
  const ds = await getDataSource();
  const repository = ds.getRepository(TeacherEntity);
  await repository.upsert(
    {
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
      passwordHash: teacher.passwordHash,
    },
    ["id"],
  );
}

export async function getTeacherByEmail(
  email: string,
): Promise<Teacher | null> {
  const ds = await getDataSource();
  const repository = ds.getRepository(TeacherEntity);
  const teacher = await repository.findOne({ where: { email } });
  return teacher ? toTeacher(teacher) : null;
}

export async function getTeacherById(id: string): Promise<Teacher | null> {
  const ds = await getDataSource();
  const repository = ds.getRepository(TeacherEntity);
  const teacher = await repository.findOne({ where: { id } });
  return teacher ? toTeacher(teacher) : null;
}

export async function createSession(params: {
  teacherId: string;
  provider: Provider;
  model: string;
  messages?: ChatMessage[];
  tasks?: SessionTask[];
}): Promise<SessionRecord> {
  const ds = await getDataSource();
  const repository = ds.getRepository(SessionEntity);

  const session = repository.create({
    teacherId: params.teacherId,
    provider: params.provider,
    model: params.model,
    messages: params.messages ?? [],
    tasks: params.tasks ?? [],
    traceHistory: [],
    contextHistory: [],
    activeSkills: [],
    command: null,
    agentName: null,
  });

  const saved = await repository.save(session);
  return toSessionRecord(saved);
}

export async function listSessions(
  teacherId: string,
): Promise<SessionRecord[]> {
  const ds = await getDataSource();
  const repository = ds.getRepository(SessionEntity);

  const sessions = await repository.find({
    where: { teacherId },
    order: { updatedAt: "DESC" },
  });

  return sessions.map(toSessionRecord);
}

export async function readSession(id: string): Promise<SessionRecord | null> {
  const ds = await getDataSource();
  const repository = ds.getRepository(SessionEntity);

  const session = await repository.findOne({ where: { id } });
  return session ? toSessionRecord(session) : null;
}

export async function appendSessionMessages(
  id: string,
  teacherId: string,
  messages: ChatMessage[],
  provider?: Provider,
  model?: string,
  runtime?: {
    trace?: ChatTrace;
    contextPaths?: string[];
    activeSkills?: string[];
  },
): Promise<SessionRecord | null> {
  const ds = await getDataSource();
  const repository = ds.getRepository(SessionEntity);

  const existing = await repository.findOne({ where: { id } });
  if (!existing || existing.teacherId !== teacherId) {
    return null;
  }

  existing.messages = [
    ...parseArray<ChatMessage>(existing.messages),
    ...messages,
  ];
  if (provider) {
    existing.provider = provider;
  }
  if (model) {
    existing.model = model;
  }
  if (runtime?.trace) {
    existing.traceHistory = [
      runtime.trace,
      ...parseArray<ChatTrace>(existing.traceHistory),
    ];
  }
  if (runtime?.contextPaths) {
    existing.contextHistory = [
      runtime.contextPaths,
      ...parseArray<string[]>(existing.contextHistory),
    ];
  }
  if (runtime?.activeSkills) {
    existing.activeSkills = runtime.activeSkills;
  }

  const updated = await repository.save(existing);
  return toSessionRecord(updated);
}

export async function deleteSession(
  id: string,
  teacherId: string,
): Promise<boolean> {
  const ds = await getDataSource();
  const repository = ds.getRepository(SessionEntity);

  const deleted = await repository.delete({ id, teacherId });
  return Boolean(deleted.affected && deleted.affected > 0);
}

export async function updateSessionTasks(
  id: string,
  teacherId: string,
  tasks: SessionTask[],
): Promise<SessionRecord | null> {
  const ds = await getDataSource();
  const repository = ds.getRepository(SessionEntity);

  const existing = await repository.findOne({ where: { id } });
  if (!existing || existing.teacherId !== teacherId) {
    return null;
  }

  existing.tasks = tasks;
  const updated = await repository.save(existing);
  return toSessionRecord(updated);
}

export async function resetStores(): Promise<void> {
  const ds = await getDataSource();

  await ds.query("TRUNCATE TABLE sessions RESTART IDENTITY CASCADE");
  await ds.query("TRUNCATE TABLE teachers RESTART IDENTITY CASCADE");

  authTokens.clear();
  rateLimitMap.clear();
}
