import type { WorkspaceNode } from "../../types";

interface WorkspaceTreeItemProps {
  node: WorkspaceNode;
  depth: number;
  activePath: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  onOpenFile: (path: string) => Promise<void>;
}

export default function WorkspaceTreeItem({
  node,
  depth,
  activePath,
  expandedFolders,
  onToggleFolder,
  selectedPath,
  onSelectPath,
  onOpenFile,
}: WorkspaceTreeItemProps) {
  const indent = { paddingLeft: `${depth * 12}px` };

  if (node.type === "directory") {
    const expanded = expandedFolders[node.path] ?? true;
    return (
      <div>
        <button
          className={`w-full rounded px-1 py-0.5 text-left text-xs font-medium ${selectedPath === node.path ? "bg-paper-50" : ""}`}
          style={indent}
          type="button"
          onClick={() => {
            onSelectPath(node.path);
            onToggleFolder(node.path);
          }}
        >
          {expanded ? "▾" : "▸"} {node.name}
        </button>
        {expanded
          ? (node.children ?? []).map((child) => (
              <WorkspaceTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                expandedFolders={expandedFolders}
                onToggleFolder={onToggleFolder}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                onOpenFile={onOpenFile}
              />
            ))
          : null}
      </div>
    );
  }

  const label = node.path === "soul.md" ? `✦ ${node.name}` : node.name;

  return (
    <button
      className={`w-full rounded px-1 py-0.5 text-left text-xs ${activePath === node.path || selectedPath === node.path ? "bg-paper-50" : ""}`}
      style={indent}
      type="button"
      onClick={() => {
        onSelectPath(node.path);
        void onOpenFile(node.path);
      }}
    >
      {label}
    </button>
  );
}
