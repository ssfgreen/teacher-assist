import type { WorkspaceFileResponse, WorkspaceTreeResponse } from "../types";
import { apiFetch } from "./client";

export async function listWorkspace(): Promise<WorkspaceTreeResponse> {
  return apiFetch<WorkspaceTreeResponse>("/api/workspace");
}

export async function seedWorkspace(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/workspace/seed", {
    method: "POST",
  });
}

export async function readWorkspaceFile(
  path: string,
): Promise<WorkspaceFileResponse> {
  const encoded = encodeURI(path);
  return apiFetch<WorkspaceFileResponse>(`/api/workspace/${encoded}`);
}

export async function writeWorkspaceFile(
  path: string,
  content: string,
): Promise<{ ok: boolean; path: string }> {
  const encoded = encodeURI(path);
  return apiFetch<{ ok: boolean; path: string }>(`/api/workspace/${encoded}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  const encoded = encodeURI(path);
  await apiFetch<never>(`/api/workspace/${encoded}`, {
    method: "DELETE",
  });
}
