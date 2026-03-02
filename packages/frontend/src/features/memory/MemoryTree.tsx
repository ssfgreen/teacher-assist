import { Brain, FolderOpen } from "lucide-react";
import type { WorkspaceNode } from "../../types";

interface MemoryTreeProps {
  tree: WorkspaceNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

function MemoryNode({
  node,
  depth,
  selectedPath,
  onSelectFile,
}: {
  node: WorkspaceNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const indent = { paddingLeft: `${depth * 12}px` };

  if (node.type === "directory") {
    return (
      <div>
        <p className="py-0.5 text-xs font-medium text-ink-800" style={indent}>
          <span className="inline-flex items-center gap-1">
            <FolderOpen className="h-3 w-3" />
            {node.name}
          </span>
        </p>
        {(node.children ?? []).map((child) => (
          <MemoryNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    );
  }

  return (
    <button
      className={`w-full rounded py-0.5 text-left text-xs transition ${selectedPath === node.path ? "bg-surface-selected" : "hover:bg-paper-50"}`}
      style={indent}
      type="button"
      onClick={() => onSelectFile(node.path)}
    >
      <span className="inline-flex items-center gap-1">
        <Brain className="h-3 w-3" />
        {node.name}
      </span>
    </button>
  );
}

export default function MemoryTree({
  tree,
  selectedPath,
  onSelectFile,
}: MemoryTreeProps) {
  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <MemoryNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}
