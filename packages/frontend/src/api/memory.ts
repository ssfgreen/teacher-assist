import type { WorkspaceFileResponse, WorkspaceNode } from "../types";
import { apiFetch } from "./client";

export async function listMemory(): Promise<{ tree: WorkspaceNode[] }> {
  return apiFetch<{ tree: WorkspaceNode[] }>("/api/memory");
}

export async function readMemoryFile(
  path: string,
): Promise<WorkspaceFileResponse> {
  const encoded = encodeURI(path);
  return apiFetch<WorkspaceFileResponse>(`/api/memory/${encoded}`);
}

export async function writeMemoryFile(
  path: string,
  content: string,
): Promise<{ ok: boolean; path: string }> {
  const encoded = encodeURI(path);
  return apiFetch<{ ok: boolean; path: string }>(`/api/memory/${encoded}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function deleteMemoryFile(path: string): Promise<void> {
  const encoded = encodeURI(path);
  await apiFetch<never>(`/api/memory/${encoded}`, {
    method: "DELETE",
  });
}
