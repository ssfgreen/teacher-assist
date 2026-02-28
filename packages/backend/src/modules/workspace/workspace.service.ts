import { Injectable } from "@nestjs/common";

import { throwApiError } from "../../common/api-error";
import {
  deleteWorkspaceFile,
  listClassRefs,
  listWorkspaceTree,
  renameWorkspacePath,
  resetWorkspaceForTeacher,
  seedWorkspaceForTeacher,
  writeWorkspaceFile,
} from "../../workspace";

const STORAGE_ERROR_FRAGMENTS = [
  "Workspace storage requires PostgreSQL",
  "workspace_files table is missing",
];

@Injectable()
export class WorkspaceService {
  async seed(teacherId: string): Promise<void> {
    await seedWorkspaceForTeacher(teacherId);
  }

  async reset(teacherId: string): Promise<void> {
    await resetWorkspaceForTeacher(teacherId);
  }

  async list(teacherId: string): Promise<{
    tree: Awaited<ReturnType<typeof listWorkspaceTree>>;
    classRefs: Awaited<ReturnType<typeof listClassRefs>>;
  }> {
    const tree = await listWorkspaceTree(teacherId);
    const classRefs = await listClassRefs(teacherId);
    return { tree, classRefs };
  }

  async rename(params: {
    teacherId: string;
    fromPath: string;
    toPath: string;
  }): Promise<Awaited<ReturnType<typeof renameWorkspacePath>>> {
    return renameWorkspacePath(params);
  }

  async write(
    teacherId: string,
    relativePath: string,
    content: string,
  ): Promise<void> {
    await writeWorkspaceFile(teacherId, relativePath, content);
  }

  async remove(teacherId: string, relativePath: string): Promise<void> {
    await deleteWorkspaceFile(teacherId, relativePath);
  }

  throwStorageError(error: unknown): never {
    const message =
      error instanceof Error ? error.message : "Workspace storage unavailable";

    if (
      STORAGE_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment))
    ) {
      throwApiError(503, message);
    }

    throwApiError(400, message);
  }

  throwRenameError(error: unknown): never {
    const message =
      error instanceof Error ? error.message : "Invalid workspace path";

    if (
      STORAGE_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment))
    ) {
      throwApiError(503, message);
    }

    if (message === "Workspace path not found") {
      throwApiError(404, message);
    }

    if (message.includes("already exists")) {
      throwApiError(409, message);
    }

    throwApiError(400, message);
  }

  throwDeleteError(error: unknown): never {
    const message =
      error instanceof Error ? error.message : "Invalid workspace path";

    if (
      STORAGE_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment))
    ) {
      throwApiError(503, message);
    }

    if (message === "Cannot delete soul.md") {
      throwApiError(400, message);
    }

    throwApiError(404, message);
  }
}
