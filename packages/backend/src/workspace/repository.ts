import { getDataSource } from "../db";
import { DEFAULT_WORKSPACE_FILES } from "./defaults";

export async function requireWorkspaceSql(): Promise<void> {
  const ds = await getDataSource();

  try {
    const rows = (await ds.query(
      "SELECT to_regclass('public.workspace_files') AS table_name",
    )) as Array<{ table_name: string | null }>;
    if (!rows[0]?.table_name) {
      throw new Error();
    }
  } catch {
    throw new Error(
      "workspace_files table is missing. Run `cd packages/backend && bun run migrate`.",
    );
  }
}

export async function ensureWorkspaceStorageReady(): Promise<void> {
  await requireWorkspaceSql();
}

export async function seedWorkspacePostgres(teacherId: string): Promise<void> {
  await requireWorkspaceSql();
  const ds = await getDataSource();

  for (const item of DEFAULT_WORKSPACE_FILES) {
    await ds.query(
      `
      INSERT INTO workspace_files (teacher_id, path, content)
      VALUES ($1::uuid, $2, $3)
      ON CONFLICT (teacher_id, path) DO NOTHING
      `,
      [teacherId, item.path, item.content],
    );
  }
}

export async function clearWorkspacePostgres(teacherId: string): Promise<void> {
  await requireWorkspaceSql();
  const ds = await getDataSource();
  await ds.query(
    `
    DELETE FROM workspace_files
    WHERE teacher_id = $1::uuid
    `,
    [teacherId],
  );
}

export async function listWorkspacePathsPostgres(
  teacherId: string,
): Promise<string[]> {
  await requireWorkspaceSql();
  const ds = await getDataSource();

  const rows = (await ds.query(
    `
    SELECT path FROM workspace_files
    WHERE teacher_id = $1::uuid
    ORDER BY path ASC
    `,
    [teacherId],
  )) as Array<{ path: string }>;

  return rows.map((row) => row.path);
}

export async function readWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
): Promise<string | null> {
  await requireWorkspaceSql();
  const ds = await getDataSource();

  const rows = (await ds.query(
    `
    SELECT content FROM workspace_files
    WHERE teacher_id = $1::uuid AND path = $2
    LIMIT 1
    `,
    [teacherId, relativePath],
  )) as Array<{ content: string }>;

  return rows[0]?.content ?? null;
}

export async function writeWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await requireWorkspaceSql();
  const ds = await getDataSource();

  await ds.query(
    `
    INSERT INTO workspace_files (teacher_id, path, content)
    VALUES ($1::uuid, $2, $3)
    ON CONFLICT (teacher_id, path)
    DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
    `,
    [teacherId, relativePath, content],
  );
}

export async function deleteWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
): Promise<void> {
  await requireWorkspaceSql();
  const ds = await getDataSource();

  await ds.query(
    `
    DELETE FROM workspace_files
    WHERE teacher_id = $1::uuid AND path = $2
    `,
    [teacherId, relativePath],
  );
}

export async function resetTeacherWorkspaceForTests(
  teacherId: string,
): Promise<void> {
  await clearWorkspacePostgres(teacherId);
}
