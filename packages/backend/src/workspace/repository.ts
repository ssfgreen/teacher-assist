import { SQL } from "bun";

import { resolveDatabaseUrl } from "../config";
import { DEFAULT_WORKSPACE_FILES, WORKSPACE_DB_CONFIG_ERROR } from "./defaults";

let sqlClient: SQL | null = null;

async function getSql(): Promise<SQL | null> {
  if (!sqlClient) {
    sqlClient = new SQL(resolveDatabaseUrl());
  }

  try {
    await sqlClient`SELECT 1`;
    return sqlClient;
  } catch {
    return null;
  }
}

export async function requireWorkspaceSql(): Promise<SQL> {
  const sql = await getSql();
  if (!sql) {
    throw new Error(WORKSPACE_DB_CONFIG_ERROR);
  }

  try {
    const rows = (await sql`
      SELECT to_regclass('public.workspace_files') AS table_name
    `) as Array<{ table_name: string | null }>;
    if (!rows[0]?.table_name) {
      throw new Error();
    }
  } catch {
    throw new Error(
      "workspace_files table is missing. Run `cd packages/backend && bun run migrate`.",
    );
  }

  return sql;
}

export async function ensureWorkspaceStorageReady(): Promise<void> {
  await requireWorkspaceSql();
}

export async function seedWorkspacePostgres(teacherId: string): Promise<void> {
  const sql = await requireWorkspaceSql();

  for (const item of DEFAULT_WORKSPACE_FILES) {
    await sql`
      INSERT INTO workspace_files (teacher_id, path, content)
      VALUES (${teacherId}, ${item.path}, ${item.content})
      ON CONFLICT (teacher_id, path) DO NOTHING
    `;
  }
}

export async function listWorkspacePathsPostgres(
  teacherId: string,
): Promise<string[]> {
  const sql = await requireWorkspaceSql();

  const rows = (await sql`
    SELECT path FROM workspace_files
    WHERE teacher_id = ${teacherId}
    ORDER BY path ASC
  `) as Array<{ path: string }>;

  return rows.map((row) => row.path);
}

export async function readWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
): Promise<string | null> {
  const sql = await requireWorkspaceSql();

  const rows = (await sql`
    SELECT content FROM workspace_files
    WHERE teacher_id = ${teacherId} AND path = ${relativePath}
    LIMIT 1
  `) as Array<{ content: string }>;

  return rows[0]?.content ?? null;
}

export async function writeWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const sql = await requireWorkspaceSql();

  await sql`
    INSERT INTO workspace_files (teacher_id, path, content)
    VALUES (${teacherId}, ${relativePath}, ${content})
    ON CONFLICT (teacher_id, path)
    DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
  `;
}

export async function deleteWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
): Promise<void> {
  const sql = await requireWorkspaceSql();

  await sql`
    DELETE FROM workspace_files
    WHERE teacher_id = ${teacherId} AND path = ${relativePath}
  `;
}

export async function resetTeacherWorkspaceForTests(
  teacherId: string,
): Promise<void> {
  const sql = await getSql();
  if (sql) {
    await sql`
      DELETE FROM workspace_files
      WHERE teacher_id = ${teacherId}
    `;
  }
}
