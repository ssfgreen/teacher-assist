import { Injectable } from "@nestjs/common";

import { throwApiError } from "../../common/api-error";
import {
  deleteMemoryFile,
  listMemoryTree,
  parseMemoryVirtualPath,
  readMemoryFile,
  upsertMemoryFile,
} from "../../memory";

@Injectable()
export class MemoryService {
  async list(teacherId: string) {
    const tree = await listMemoryTree(teacherId);
    return { tree };
  }

  async read(teacherId: string, path: string) {
    const parsed = parseMemoryVirtualPath(path);
    const content = await readMemoryFile(teacherId, parsed.virtualPath);
    return {
      path: parsed.virtualPath,
      content,
    };
  }

  async write(teacherId: string, path: string, content: string) {
    const parsed = parseMemoryVirtualPath(path);
    await upsertMemoryFile({
      teacherId,
      virtualPath: parsed.virtualPath,
      content,
      mode: "replace",
    });

    return {
      ok: true,
      path: parsed.virtualPath,
    };
  }

  async remove(teacherId: string, path: string): Promise<void> {
    const parsed = parseMemoryVirtualPath(path);
    const removed = await deleteMemoryFile(teacherId, parsed.virtualPath);
    if (!removed) {
      throwApiError(404, "Memory file not found");
    }
  }

  throwStorageError(error: unknown): never {
    const message =
      error instanceof Error ? error.message : "Memory storage unavailable";

    if (message === "Memory file not found") {
      throwApiError(404, message);
    }

    if (message.includes("Invalid workspace path")) {
      throwApiError(400, "Invalid memory path");
    }

    throwApiError(400, message);
  }
}
