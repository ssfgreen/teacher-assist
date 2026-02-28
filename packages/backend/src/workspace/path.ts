import { normalize } from "node:path";

export function normalizeRelativePath(path: string): string {
  const normalized = normalize(path).replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    throw new Error("Invalid workspace path");
  }

  if (normalized.includes("..") || normalized.startsWith("/")) {
    throw new Error("Invalid workspace path");
  }

  return normalized;
}

export function normalizeDirectoryPrefix(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}
