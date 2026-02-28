import type { WorkspaceNode } from "../../types";

export function collectFiles(nodes: WorkspaceNode[]): string[] {
  const files: string[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      files.push(node.path);
      continue;
    }
    files.push(...collectFiles(node.children ?? []));
  }
  return files;
}

export function findNodeByPath(
  nodes: WorkspaceNode[],
  path: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    if (node.type === "directory") {
      const found = findNodeByPath(node.children ?? [], path);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function parentDirectory(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "";
  }
  return parts.slice(0, -1).join("/");
}

export function joinPath(base: string, suffix: string): string {
  if (!base) {
    return suffix;
  }
  return `${base}/${suffix}`;
}

export function resolveRenameTargetPath(
  selectedNode: WorkspaceNode,
  userInput: string,
): string {
  const normalizedInput = userInput
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  if (!normalizedInput) {
    return selectedNode.path;
  }

  if (normalizedInput.includes("/")) {
    return normalizedInput;
  }

  const parent = parentDirectory(selectedNode.path);
  return joinPath(parent, normalizedInput);
}

export function displayContextPath(path: string): string {
  if (path === "soul.md") {
    return "assistant identity";
  }

  if (path.startsWith("classes/") && path.endsWith("/CLASS.md")) {
    const classRef = path.replace("classes/", "").replace("/CLASS.md", "");
    return `${classRef} class profile`;
  }

  if (path.startsWith("curriculum/")) {
    return `${path.replace("curriculum/", "").replace(".md", "")} curriculum`;
  }

  if (path === "pedagogy.md") {
    return "pedagogy preferences";
  }

  if (path === "teacher.md") {
    return "teacher profile";
  }

  return path;
}
