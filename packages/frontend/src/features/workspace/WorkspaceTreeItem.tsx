import {
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  FolderOpen,
  Pencil,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  onStartRename: (path: string) => void;
  onStartCreate: (path: string, mode: "file" | "folder") => void;
  onArchivePath: (path: string) => void;
}

function RowActions({
  node,
  onStartRename,
  onStartCreate,
  onArchivePath,
}: {
  node: WorkspaceNode;
  onStartRename: (path: string) => void;
  onStartCreate: (path: string, mode: "file" | "folder") => void;
  onArchivePath: (path: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative ml-1 flex items-center gap-1">
      <button
        className="rounded px-1 py-0.5 text-[11px] text-ink-700 opacity-0 transition group-hover:opacity-100 hover:bg-paper-100"
        type="button"
        aria-label={`Rename ${node.path}`}
        onClick={(event) => {
          event.stopPropagation();
          onStartRename(node.path);
        }}
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        className="rounded px-1 py-0.5 text-[11px] text-ink-700 opacity-0 transition group-hover:opacity-100 hover:bg-paper-100"
        type="button"
        aria-label={`More actions for ${node.path}`}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((current) => !current);
        }}
      >
        <Ellipsis className="h-3 w-3" />
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-6 z-10 w-32 rounded-lg border border-paper-300 bg-surface-panel p-1 text-xs shadow">
          {node.type === "directory" ? (
            <>
              <button
                className="block w-full rounded px-2 py-1 text-left hover:bg-paper-100"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartCreate(node.path, "folder");
                  setMenuOpen(false);
                }}
              >
                New folder
              </button>
              <button
                className="block w-full rounded px-2 py-1 text-left hover:bg-paper-100"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartCreate(node.path, "file");
                  setMenuOpen(false);
                }}
              >
                New file
              </button>
            </>
          ) : (
            <button
              className="block w-full rounded px-2 py-1 text-left hover:bg-paper-100"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStartRename(node.path);
                setMenuOpen(false);
              }}
            >
              Rename
            </button>
          )}
          <button
            className="block w-full rounded px-2 py-1 text-left text-danger-700 hover:bg-danger-50"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onArchivePath(node.path);
              setMenuOpen(false);
            }}
          >
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );
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
  onStartRename,
  onStartCreate,
  onArchivePath,
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
            className="w-full rounded border border-accent-500 bg-surface-input px-1 py-0.5 text-xs"
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
          <div
            className={`group flex items-center justify-between rounded px-1 py-0.5 text-xs font-medium ${selectedPath === node.path ? "bg-surface-selected" : "hover:bg-paper-50"}`}
            style={indent}
          >
            <button
              className="min-w-0 flex-1 text-left"
              type="button"
              onClick={() => {
                onSelectPath(node.path);
                onToggleFolder(node.path);
              }}
            >
              <span className="inline-flex items-center gap-1">
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <FolderOpen className="h-3 w-3" />
                {node.name}
              </span>
            </button>
            <RowActions
              node={node}
              onStartRename={onStartRename}
              onStartCreate={onStartCreate}
              onArchivePath={onArchivePath}
            />
          </div>
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
                  onStartRename={onStartRename}
                  onStartCreate={onStartCreate}
                  onArchivePath={onArchivePath}
                />
              )),
              isCreatingHere ? (
                <input
                  ref={createInputRef}
                  key={`${node.path}-create`}
                  className="w-full rounded border border-accent-500 bg-surface-input px-1 py-0.5 text-xs"
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

  if (isEditing) {
    return (
      <input
        ref={editInputRef}
        className="w-full rounded border border-accent-500 bg-surface-input px-1 py-0.5 text-xs"
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
    <div
      className={`group flex items-center justify-between rounded px-1 py-0.5 text-xs ${activePath === node.path || selectedPath === node.path ? "bg-surface-selected" : "hover:bg-paper-50"}`}
      style={indent}
    >
      <button
        className="min-w-0 flex-1 truncate text-left"
        type="button"
        onClick={() => {
          onSelectPath(node.path);
          void onOpenFile(node.path);
        }}
      >
        <span className="inline-flex items-center gap-1">
          {node.path === "soul.md" ? (
            <Sparkles className="h-3 w-3" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          {node.name}
        </span>
      </button>
      <RowActions
        node={node}
        onStartRename={onStartRename}
        onStartCreate={onStartCreate}
        onArchivePath={onArchivePath}
      />
    </div>
  );
}
