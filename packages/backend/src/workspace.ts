import { normalize } from "node:path";
import { SQL } from "bun";

import { resolveDatabaseUrl } from "./config";
import type { ChatMessage } from "./types";

const CLASS_REF_PATTERN = /\b([1-6][A-Za-z])\b/g;

const DEFAULT_SOUL = `# Assistant Identity

You are a practical lesson-planning assistant.

## Working stance
- Draft, do not decide for the teacher.
- Be explicit about tradeoffs and assumptions.
- Do not claim curriculum alignment without evidence from workspace files.
`;

const DEFAULT_TEACHER = `# Teacher Profile

- Name:
- School:
- Subject specialism:
- Year groups taught:
`;

const DEFAULT_PEDAGOGY = `# Pedagogy Preferences

- Preferred lesson structure:
- Differentiation approaches:
- Assessment style:
- Classroom routines:
`;

const DEFAULT_CURRICULUM_STUB = `# Curriculum Notes

Add curriculum references and copied excerpts here.
`;

const DEFAULT_CLASS_STUB = `# Class Profile

- Size:
- Stage:
- Needs:
- Prior learning:
`;

const CLASS_PROFILE_FILENAME = "CLASS.md";

const DEFAULT_WORKSPACE_FILES: Array<{ path: string; content: string }> = [
  { path: "soul.md", content: DEFAULT_SOUL },
  { path: "teacher.md", content: DEFAULT_TEACHER },
  { path: "pedagogy.md", content: DEFAULT_PEDAGOGY },
  { path: "curriculum/README.md", content: DEFAULT_CURRICULUM_STUB },
  { path: "classes/README.md", content: DEFAULT_CLASS_STUB },
];

let sqlClient: SQL | null = null;

export interface WorkspaceNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: WorkspaceNode[];
}

export interface LoadedWorkspaceContext {
  assistantIdentity: string;
  workspaceContextSections: Array<{ path: string; content: string }>;
  loadedPaths: string[];
  classRef: string | null;
}

const WORKSPACE_DB_CONFIG_ERROR =
  "Workspace storage requires PostgreSQL. Ensure Postgres is running (`docker compose up -d`) and run `cd packages/backend && bun run migrate`.";

function normalizeRelativePath(path: string): string {
  const normalized = normalize(path).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    throw new Error("Invalid workspace path");
  }

  if (normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error("Invalid workspace path");
  }

  return normalized;
}

function parseClassRef(value: string): string | null {
  const matches = [...value.matchAll(CLASS_REF_PATTERN)];
  if (matches.length === 0) {
    return null;
  }

  const match = matches.at(-1);
  return match?.[1]?.toUpperCase() ?? null;
}

function knownSubjectTokens(): string[] {
  return [
    "computing",
    "science",
    "math",
    "mathematics",
    "history",
    "english",
    "biology",
    "chemistry",
    "physics",
    "geography",
    "music",
    "drama",
    "art",
  ];
}

function classProfilePath(classRef: string): string {
  return `classes/${classRef}/${CLASS_PROFILE_FILENAME}`;
}

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

async function requireWorkspaceSql(): Promise<SQL> {
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

async function seedWorkspacePostgres(teacherId: string): Promise<void> {
  const sql = await requireWorkspaceSql();

  for (const item of DEFAULT_WORKSPACE_FILES) {
    await sql`
      INSERT INTO workspace_files (teacher_id, path, content)
      VALUES (${teacherId}, ${item.path}, ${item.content})
      ON CONFLICT (teacher_id, path) DO NOTHING
    `;
  }
}

async function listWorkspacePathsPostgres(
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

async function readWorkspaceFilePostgres(
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

async function writeWorkspaceFilePostgres(
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

async function deleteWorkspaceFilePostgres(
  teacherId: string,
  relativePath: string,
): Promise<void> {
  const sql = await requireWorkspaceSql();

  await sql`
    DELETE FROM workspace_files
    WHERE teacher_id = ${teacherId} AND path = ${relativePath}
  `;
}

function normalizeDirectoryPrefix(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function buildTreeFromPaths(paths: string[]): WorkspaceNode[] {
  interface MutableNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: Map<string, MutableNode>;
  }

  const root = new Map<string, MutableNode>();

  for (const relativePath of paths) {
    const parts = relativePath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;

      if (!current.has(part)) {
        current.set(part, {
          name: part,
          path: currentPath,
          type: isLast ? "file" : "directory",
          children: isLast ? undefined : new Map<string, MutableNode>(),
        });
      }

      const node = current.get(part);
      if (!node || !node.children) {
        break;
      }
      current = node.children;
    }
  }

  function toWorkspaceNodes(nodes: Map<string, MutableNode>): WorkspaceNode[] {
    const list = [...nodes.values()].map((node) => {
      if (node.type === "directory") {
        return {
          name: node.name,
          path: node.path,
          type: "directory" as const,
          children: toWorkspaceNodes(node.children ?? new Map()),
        };
      }
      return {
        name: node.name,
        path: node.path,
        type: "file" as const,
      };
    });

    return list.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") {
        return -1;
      }
      if (a.type !== "directory" && b.type === "directory") {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return toWorkspaceNodes(root);
}

export async function seedWorkspaceForTeacher(
  teacherId: string,
): Promise<void> {
  await seedWorkspacePostgres(teacherId);
}

export async function listWorkspaceTree(
  teacherId: string,
): Promise<WorkspaceNode[]> {
  await seedWorkspaceForTeacher(teacherId);
  const dbPaths = await listWorkspacePathsPostgres(teacherId);
  return buildTreeFromPaths(dbPaths);
}

export async function readWorkspaceFile(
  teacherId: string,
  relativePath: string,
): Promise<string> {
  await seedWorkspaceForTeacher(teacherId);
  const normalizedPath = normalizeRelativePath(relativePath);

  const dbContent = await readWorkspaceFilePostgres(teacherId, normalizedPath);
  if (dbContent === null) {
    throw new Error("Workspace file not found");
  }
  return dbContent;
}

export async function writeWorkspaceFile(
  teacherId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  await seedWorkspaceForTeacher(teacherId);
  const normalizedPath = normalizeRelativePath(relativePath);
  await writeWorkspaceFilePostgres(teacherId, normalizedPath, content);
}

export async function deleteWorkspaceFile(
  teacherId: string,
  relativePath: string,
): Promise<void> {
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === "soul.md") {
    throw new Error("Cannot delete soul.md");
  }

  await deleteWorkspaceFilePostgres(teacherId, normalized);
}

export async function renameWorkspacePath(params: {
  teacherId: string;
  fromPath: string;
  toPath: string;
}): Promise<{ fromPath: string; toPath: string; renamedCount: number }> {
  await seedWorkspaceForTeacher(params.teacherId);
  const fromPath = normalizeRelativePath(params.fromPath);
  const toPath = normalizeRelativePath(params.toPath);

  if (fromPath === toPath) {
    return { fromPath, toPath, renamedCount: 0 };
  }

  if (fromPath === "soul.md" || toPath === "soul.md") {
    throw new Error("Cannot rename soul.md");
  }

  const allPaths = await listWorkspacePathsPostgres(params.teacherId);
  const allPathSet = new Set(allPaths);

  if (allPathSet.has(fromPath)) {
    if (allPathSet.has(toPath)) {
      throw new Error("Target path already exists");
    }

    const content = await readWorkspaceFilePostgres(params.teacherId, fromPath);
    if (content === null) {
      throw new Error("Workspace path not found");
    }

    await writeWorkspaceFilePostgres(params.teacherId, toPath, content);
    await deleteWorkspaceFilePostgres(params.teacherId, fromPath);
    return { fromPath, toPath, renamedCount: 1 };
  }

  const fromPrefix = normalizeDirectoryPrefix(fromPath);
  const folderPaths = allPaths.filter((path) => path.startsWith(fromPrefix));
  if (folderPaths.length === 0) {
    throw new Error("Workspace path not found");
  }

  const toPrefix = normalizeDirectoryPrefix(toPath);
  if (toPrefix.startsWith(fromPrefix)) {
    throw new Error("Cannot move a folder into itself");
  }

  const renamePlan = folderPaths.map((oldPath) => {
    const suffix = oldPath.slice(fromPrefix.length);
    return {
      oldPath,
      newPath: `${toPrefix}${suffix}`,
    };
  });

  for (const item of renamePlan) {
    if (allPathSet.has(item.newPath) && !folderPaths.includes(item.newPath)) {
      throw new Error("Target path already exists");
    }
  }

  for (const item of renamePlan) {
    const content = await readWorkspaceFilePostgres(
      params.teacherId,
      item.oldPath,
    );
    if (content === null) {
      throw new Error("Workspace path not found");
    }
    await writeWorkspaceFilePostgres(params.teacherId, item.newPath, content);
  }

  for (const item of renamePlan) {
    await deleteWorkspaceFilePostgres(params.teacherId, item.oldPath);
  }

  return {
    fromPath,
    toPath,
    renamedCount: renamePlan.length,
  };
}

export function extractClassRefFromMessages(
  messages: ChatMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }
    const classRef = parseClassRef(message.content);
    if (classRef) {
      return classRef;
    }
  }

  return null;
}

export async function listClassRefs(teacherId: string): Promise<string[]> {
  await seedWorkspaceForTeacher(teacherId);
  const dbPaths = await listWorkspacePathsPostgres(teacherId);
  const refs = new Set<string>();
  for (const path of dbPaths) {
    const match = path.match(/^classes\/([^/]+)\/CLASS\.md$/i);
    if (match?.[1]) {
      refs.add(match[1].toUpperCase());
    }
  }
  return [...refs].sort((a, b) => a.localeCompare(b));
}

async function maybeReadWorkspaceFile(
  teacherId: string,
  relativePath: string,
): Promise<string | null> {
  try {
    return await readWorkspaceFile(teacherId, relativePath);
  } catch {
    return null;
  }
}

async function listWorkspacePaths(teacherId: string): Promise<string[]> {
  return listWorkspacePathsPostgres(teacherId);
}

export async function loadWorkspaceContext(params: {
  teacherId: string;
  messages: ChatMessage[];
  classRef?: string;
}): Promise<LoadedWorkspaceContext> {
  await seedWorkspaceForTeacher(params.teacherId);

  const classRef =
    params.classRef?.trim().toUpperCase() ||
    extractClassRefFromMessages(params.messages);

  const assistantIdentity =
    (await maybeReadWorkspaceFile(params.teacherId, "soul.md")) ?? DEFAULT_SOUL;

  const workspaceContextSections: Array<{ path: string; content: string }> = [];
  const loadedPaths = new Set<string>();

  const corePaths = ["teacher.md", "pedagogy.md"];
  for (const path of corePaths) {
    const content = await maybeReadWorkspaceFile(params.teacherId, path);
    if (!content) {
      continue;
    }
    workspaceContextSections.push({ path, content });
    loadedPaths.add(path);
  }

  if (classRef) {
    const classPath = classProfilePath(classRef);
    const classContent = await maybeReadWorkspaceFile(
      params.teacherId,
      classPath,
    );
    if (classContent) {
      workspaceContextSections.push({ path: classPath, content: classContent });
      loadedPaths.add(classPath);
    }

    const lowerSignal = [
      ...knownSubjectTokens().filter((token) =>
        params.messages.some((message) =>
          message.content.toLowerCase().includes(token),
        ),
      ),
      ...(classContent?.toLowerCase().match(/[a-z]+/g) ?? []),
    ];

    const allPaths = await listWorkspacePaths(params.teacherId);
    const curriculumFiles = allPaths
      .filter((path) => path.startsWith("curriculum/"))
      .filter((path) => path.toLowerCase().endsWith(".md"))
      .filter((path) => path.toLowerCase() !== "curriculum/readme.md")
      .map((path) => path.replace("curriculum/", ""));

    const relevantCurriculum = curriculumFiles.filter((file) => {
      const normalized = file.toLowerCase();
      return lowerSignal.some((token) => normalized.includes(token));
    });

    const selectedCurriculum =
      relevantCurriculum.length > 0 ? relevantCurriculum : curriculumFiles;

    for (const file of selectedCurriculum) {
      const path = `curriculum/${file}`;
      const content = await maybeReadWorkspaceFile(params.teacherId, path);
      if (!content) {
        continue;
      }
      workspaceContextSections.push({ path, content });
      loadedPaths.add(path);
    }
  }

  loadedPaths.add("soul.md");

  return {
    assistantIdentity,
    workspaceContextSections,
    loadedPaths: [...loadedPaths.values()],
    classRef: classRef ?? null,
  };
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
