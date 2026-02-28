import { useEffect, useRef } from "react";

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
  editingPath: string | null;
  editingValue: string;
  onEditingValueChange: (value: string) => void;
  onEditingCommit: (path: string) => void;
  onEditingCancel: () => void;
  createParentPath: string | null;
  createMode: "file" | "folder" | null;
  createValue: string;
  onCreateValueChange: (value: string) => void;
  onCreateCommit: () => void;
  onCreateCancel: () => void;
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
  editingPath,
  editingValue,
  onEditingValueChange,
  onEditingCommit,
  onEditingCancel,
  createParentPath,
  createMode,
  createValue,
  onCreateValueChange,
  onCreateCommit,
  onCreateCancel,
}: WorkspaceTreeItemProps) {
  const indent = { paddingLeft: `${depth * 12}px` };
  const isEditing = editingPath === node.path;
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const isCreatingHere = createParentPath === node.path;

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    editInputRef.current?.focus();
    editInputRef.current?.select();
  }, [isEditing]);

  useEffect(() => {
    if (!isCreatingHere) {
      return;
    }
    createInputRef.current?.focus();
    createInputRef.current?.select();
  }, [isCreatingHere]);

  if (node.type === "directory") {
    const expanded = expandedFolders[node.path] ?? true;
    return (
      <div>
        {isEditing ? (
          <input
            ref={editInputRef}
            className="w-full rounded border border-accent-600 bg-white px-1 py-0.5 text-xs"
            style={indent}
            value={editingValue}
            onChange={(event) => onEditingValueChange(event.target.value)}
            onBlur={() => onEditingCommit(node.path)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onEditingCommit(node.path);
              }
              if (event.key === "Escape") {
                onEditingCancel();
              }
            }}
          />
        ) : (
          <button
            className={`w-full rounded px-1 py-0.5 text-left text-xs font-medium ${selectedPath === node.path ? "bg-paper-50" : ""}`}
            style={indent}
            type="button"
            onClick={() => {
              onSelectPath(node.path);
              onToggleFolder(node.path);
            }}
          >
            {expanded ? "▾" : "▸"} ▣ {node.name}
          </button>
        )}
        {expanded
          ? [
              ...(node.children ?? []).map((child) => (
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
                  editingPath={editingPath}
                  editingValue={editingValue}
                  onEditingValueChange={onEditingValueChange}
                  onEditingCommit={onEditingCommit}
                  onEditingCancel={onEditingCancel}
                  createParentPath={createParentPath}
                  createMode={createMode}
                  createValue={createValue}
                  onCreateValueChange={onCreateValueChange}
                  onCreateCommit={onCreateCommit}
                  onCreateCancel={onCreateCancel}
                />
              )),
              isCreatingHere ? (
                <input
                  ref={createInputRef}
                  key={`${node.path}-create`}
                  className="w-full rounded border border-accent-600 bg-white px-1 py-0.5 text-xs"
                  style={{ paddingLeft: `${(depth + 1) * 12}px` }}
                  value={createValue}
                  onChange={(event) => onCreateValueChange(event.target.value)}
                  onBlur={onCreateCommit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onCreateCommit();
                    }
                    if (event.key === "Escape") {
                      onCreateCancel();
                    }
                  }}
                  aria-label={
                    createMode === "file"
                      ? `New file name input for ${node.path}`
                      : `New folder name input for ${node.path}`
                  }
                />
              ) : null,
            ]
          : null}
      </div>
    );
  }

  const label = node.path === "soul.md" ? `✦ ${node.name}` : `▤ ${node.name}`;

  if (isEditing) {
    return (
      <input
        ref={editInputRef}
        className="w-full rounded border border-accent-600 bg-white px-1 py-0.5 text-xs"
        style={indent}
        value={editingValue}
        onChange={(event) => onEditingValueChange(event.target.value)}
        onBlur={() => onEditingCommit(node.path)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onEditingCommit(node.path);
          }
          if (event.key === "Escape") {
            onEditingCancel();
          }
        }}
      />
    );
  }

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
