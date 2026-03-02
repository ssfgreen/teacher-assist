import { getDataSource } from "./db";
import { normalizeRelativePath } from "./workspace/path";
import { buildTreeFromPaths } from "./workspace/tree";
import type { WorkspaceNode } from "./workspace/types";

export interface MemoryPathParts {
  classId: string | null;
  path: string;
  virtualPath: string;
}

export interface MemoryFileRecord {
  path: string;
  content: string;
}

export interface MemoryProposal {
  id: string;
  text: string;
  scope: "teacher" | "class";
  classId?: string;
}

function normalizeClassId(value: string): string {
  return value.trim().toUpperCase();
}

export function parseMemoryVirtualPath(inputPath: string): MemoryPathParts {
  const normalized = normalizeRelativePath(inputPath);
  const classMatch = normalized.match(/^classes\/([^/]+)\/(.+)$/i);
  if (!classMatch) {
    return {
      classId: null,
      path: normalized,
      virtualPath: normalized,
    };
  }

  const classId = normalizeClassId(classMatch[1]);
  const path = normalizeRelativePath(classMatch[2]);

  return {
    classId,
    path,
    virtualPath: `classes/${classId}/${path}`,
  };
}

function toVirtualPath(classId: string | null, path: string): string {
  return classId ? `classes/${classId}/${path}` : path;
}

async function logMemoryEvent(params: {
  teacherId: string;
  eventType: string;
  classId: string | null;
  path: string;
  payload?: Record<string, unknown>;
  sessionId?: string;
  traceId?: string;
  memoryFileId?: number;
}): Promise<void> {
  const ds = await getDataSource();
  await ds.query(
    `
      INSERT INTO memory_events
        (teacher_id, memory_file_id, event_type, class_id, path, payload, session_id, trace_id)
      VALUES
        ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
    `,
    [
      params.teacherId,
      params.memoryFileId ?? null,
      params.eventType,
      params.classId,
      params.path,
      JSON.stringify(params.payload ?? {}),
      params.sessionId ?? null,
      params.traceId ?? null,
    ],
  );
}

export async function listMemoryTree(
  teacherId: string,
): Promise<WorkspaceNode[]> {
  const ds = await getDataSource();
  const rows = (await ds.query(
    `
      SELECT class_id, path
      FROM memory_files
      WHERE teacher_id = $1
      ORDER BY class_id NULLS FIRST, path ASC
    `,
    [teacherId],
  )) as Array<{ class_id: string | null; path: string }>;

  const paths = rows.map((row) => toVirtualPath(row.class_id, row.path));
  return buildTreeFromPaths(paths);
}

export async function readMemoryFile(
  teacherId: string,
  virtualPath: string,
  options?: { sessionId?: string; traceId?: string },
): Promise<string> {
  const parsed = parseMemoryVirtualPath(virtualPath);
  const ds = await getDataSource();

  const rows = (await ds.query(
    `
      SELECT id, content
      FROM memory_files
      WHERE teacher_id = $1
        AND path = $2
        AND class_id IS NOT DISTINCT FROM $3
      LIMIT 1
    `,
    [teacherId, parsed.path, parsed.classId],
  )) as Array<{ id: number; content: string }>;

  if (rows.length === 0) {
    throw new Error("Memory file not found");
  }

  const file = rows[0];

  await ds.query(
    `
      UPDATE memory_files
      SET access_count = access_count + 1,
          last_accessed_at = NOW()
      WHERE id = $1
    `,
    [file.id],
  );

  await logMemoryEvent({
    teacherId,
    eventType: "read",
    classId: parsed.classId,
    path: parsed.path,
    memoryFileId: file.id,
    sessionId: options?.sessionId,
    traceId: options?.traceId,
  });

  return file.content;
}

export async function upsertMemoryFile(params: {
  teacherId: string;
  virtualPath: string;
  content: string;
  mode?: "replace" | "append";
  sessionId?: string;
  traceId?: string;
}): Promise<MemoryFileRecord> {
  const parsed = parseMemoryVirtualPath(params.virtualPath);
  const ds = await getDataSource();

  const existingRows = (await ds.query(
    `
      SELECT id, content
      FROM memory_files
      WHERE teacher_id = $1
        AND path = $2
        AND class_id IS NOT DISTINCT FROM $3
      LIMIT 1
    `,
    [params.teacherId, parsed.path, parsed.classId],
  )) as Array<{ id: number; content: string }>;

  const mode = params.mode ?? "replace";
  const prior = existingRows[0]?.content ?? "";
  const nextContent =
    mode === "append" && prior
      ? `${prior.trimEnd()}\n${params.content}`
      : params.content;

  const upsertRows = (await ds.query(
    `
      INSERT INTO memory_files (teacher_id, class_id, path, content)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (teacher_id, class_id, path)
      DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
      RETURNING id
    `,
    [params.teacherId, parsed.classId, parsed.path, nextContent],
  )) as Array<{ id: number }>;

  await logMemoryEvent({
    teacherId: params.teacherId,
    eventType: mode === "append" ? "append" : "write",
    classId: parsed.classId,
    path: parsed.path,
    payload: {
      contentLength: nextContent.length,
      mode,
    },
    sessionId: params.sessionId,
    traceId: params.traceId,
    memoryFileId: upsertRows[0]?.id,
  });

  return {
    path: parsed.virtualPath,
    content: nextContent,
  };
}

export async function deleteMemoryFile(
  teacherId: string,
  virtualPath: string,
): Promise<boolean> {
  const parsed = parseMemoryVirtualPath(virtualPath);
  const ds = await getDataSource();

  const rows = (await ds.query(
    `
      DELETE FROM memory_files
      WHERE teacher_id = $1
        AND path = $2
        AND class_id IS NOT DISTINCT FROM $3
      RETURNING id
    `,
    [teacherId, parsed.path, parsed.classId],
  )) as Array<{ id: number }>;

  if (rows.length === 0) {
    return false;
  }

  await logMemoryEvent({
    teacherId,
    eventType: "delete",
    classId: parsed.classId,
    path: parsed.path,
    memoryFileId: rows[0].id,
  });

  return true;
}

function firstLines(content: string, maxLines: number): string {
  const lines = content.split("\n");
  return lines.slice(0, maxLines).join("\n");
}

export async function loadMemoryContext(params: {
  teacherId: string;
  classRef?: string | null;
  maxLines?: number;
}): Promise<{
  teacherMemory: string | null;
  classMemory: string | null;
  loadedPaths: string[];
}> {
  const maxLines = params.maxLines ?? 200;
  const loadedPaths: string[] = [];

  let teacherMemory: string | null = null;
  try {
    const content = await readMemoryFile(params.teacherId, "MEMORY.md");
    teacherMemory = firstLines(content, maxLines);
    loadedPaths.push("MEMORY.md");
  } catch {
    teacherMemory = null;
  }

  let classMemory: string | null = null;
  if (params.classRef) {
    const classId = normalizeClassId(params.classRef);
    const classPath = `classes/${classId}/MEMORY.md`;
    try {
      const content = await readMemoryFile(params.teacherId, classPath);
      classMemory = firstLines(content, maxLines);
      loadedPaths.push(classPath);
    } catch {
      classMemory = null;
    }
  }

  return {
    teacherMemory,
    classMemory,
    loadedPaths,
  };
}

export async function searchSessions(params: {
  teacherId: string;
  query: string;
  classId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<
  Array<{
    sessionId: string;
    snippet: string;
    createdAt: string;
    classRef: string | null;
  }>
> {
  const ds = await getDataSource();
  const values: Array<string | number | null> = [params.teacherId];
  const where: string[] = ["teacher_id = $1"];

  if (params.query.trim()) {
    values.push(params.query.trim());
    where.push(
      `search_vector @@ plainto_tsquery('english', $${values.length})`,
    );
  }

  if (params.classId?.trim()) {
    values.push(normalizeClassId(params.classId));
    where.push(`class_ref = $${values.length}`);
  }

  if (params.dateFrom) {
    values.push(params.dateFrom);
    where.push(`created_at >= $${values.length}::timestamptz`);
  }

  if (params.dateTo) {
    values.push(params.dateTo);
    where.push(`created_at <= $${values.length}::timestamptz`);
  }

  values.push(Math.max(1, Math.min(params.limit ?? 20, 50)));
  const limitParam = `$${values.length}`;

  const rows = (await ds.query(
    `
      SELECT id,
             created_at,
             class_ref,
             left(session_messages_to_text(messages), 320) AS snippet
      FROM sessions
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT ${limitParam}
    `,
    values,
  )) as Array<{
    id: string;
    snippet: string;
    created_at: string;
    class_ref: string | null;
  }>;

  return rows.map((row) => ({
    sessionId: row.id,
    snippet: row.snippet,
    createdAt: new Date(row.created_at).toISOString(),
    classRef: row.class_ref,
  }));
}

export function buildMemoryCaptureProposals(params: {
  classRef?: string | null;
  latestUserMessage: string;
  finalAssistantMessage: string;
}): MemoryProposal[] {
  const proposals: MemoryProposal[] = [];
  const trimmedUser = params.latestUserMessage.trim();
  const trimmedAssistant = params.finalAssistantMessage.trim();

  if (trimmedUser.length > 0) {
    proposals.push({
      id: "proposal-user-pattern",
      text: `Teacher request pattern: ${trimmedUser.slice(0, 220)}`,
      scope: "teacher",
    });
  }

  if (trimmedAssistant.length > 0 && params.classRef) {
    proposals.push({
      id: "proposal-class-strategy",
      text: `For class ${params.classRef.toUpperCase()}: ${trimmedAssistant.slice(0, 220)}`,
      scope: "class",
      classId: params.classRef.toUpperCase(),
    });
  } else if (trimmedAssistant.length > 0) {
    proposals.push({
      id: "proposal-teacher-strategy",
      text: `Working strategy: ${trimmedAssistant.slice(0, 220)}`,
      scope: "teacher",
    });
  }

  return proposals.slice(0, 3);
}
