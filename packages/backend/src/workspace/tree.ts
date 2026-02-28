import type { WorkspaceNode } from "./types";

interface MutableNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: Map<string, MutableNode>;
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

export function buildTreeFromPaths(paths: string[]): WorkspaceNode[] {
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

  return toWorkspaceNodes(root);
}
