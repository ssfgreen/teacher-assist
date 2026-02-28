import type { ChatMessage } from "./types";
import {
  CLASS_REF_PATTERN,
  DEFAULT_SOUL,
  classProfilePath,
  knownSubjectTokens,
} from "./workspace/defaults";
import {
  normalizeDirectoryPrefix,
  normalizeRelativePath,
} from "./workspace/path";
import {
  deleteWorkspaceFilePostgres,
  ensureWorkspaceStorageReady,
  listWorkspacePathsPostgres,
  readWorkspaceFilePostgres,
  resetTeacherWorkspaceForTests,
  seedWorkspacePostgres,
  writeWorkspaceFilePostgres,
} from "./workspace/repository";
import { buildTreeFromPaths } from "./workspace/tree";
import type { LoadedWorkspaceContext, WorkspaceNode } from "./workspace/types";

export type { LoadedWorkspaceContext, WorkspaceNode } from "./workspace/types";
export {
  ensureWorkspaceStorageReady,
  resetTeacherWorkspaceForTests,
} from "./workspace/repository";

function parseClassRef(value: string): string | null {
  const matches = [...value.matchAll(CLASS_REF_PATTERN)];
  if (matches.length === 0) {
    return null;
  }

  const match = matches.at(-1);
  return match?.[1]?.toUpperCase() ?? null;
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

    const allPaths = await listWorkspacePathsPostgres(params.teacherId);
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
