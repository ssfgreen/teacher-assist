import { FolderOpen, FolderX, Pencil, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WorkspaceNode } from "../../types";
import WorkspaceTreeItem from "./WorkspaceTreeItem";
import {
  findNodeByPath,
  joinPath,
  parentDirectory,
  resolveRenameTargetPath,
} from "./path-utils";

interface WorkspaceSidebarProps {
  workspaceTree: WorkspaceNode[];
  workspaceFilesCount: number;
  expandedFolders: Record<string, boolean>;
  activeFilePath: string | null;
  selectedWorkspacePath: string | null;
  selectedWorkspaceNode: WorkspaceNode | null;
  workspaceError: string | null;
  onSelectWorkspacePath: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onOpenWorkspaceFile: (path: string) => Promise<void>;
  onResetWorkspace: () => Promise<void>;
  onUndoWorkspaceReset: () => Promise<void>;
  canUndoWorkspaceReset: boolean;
  onRenameWorkspacePath: (fromPath: string, toPath: string) => Promise<void>;
  onCreateWorkspaceFile: (path: string, content?: string) => Promise<void>;
  onDeleteWorkspacePath: (path: string) => Promise<void>;
  onExpandAllFolders: () => void;
  onCollapseAllFolders: () => void;
}

function classMarkerForFolder(folderPath: string): {
  path: string;
  content: string;
} {
  const markerFile = folderPath.startsWith("classes/")
    ? `${folderPath}/CLASS.md`
    : `${folderPath}/README.md`;
  const markerContent = markerFile.endsWith("/CLASS.md")
    ? "# Class Profile\n\n- Class:\n- Stage:\n- Notes:\n"
    : "# Folder Notes\n\n";
  return { path: markerFile, content: markerContent };
}

export default function WorkspaceSidebar({
  workspaceTree,
  workspaceFilesCount,
  expandedFolders,
  activeFilePath,
  selectedWorkspacePath,
  selectedWorkspaceNode,
  workspaceError,
  onSelectWorkspacePath,
  onToggleFolder,
  onOpenWorkspaceFile,
  onResetWorkspace,
  onUndoWorkspaceReset,
  canUndoWorkspaceReset,
  onRenameWorkspacePath,
  onCreateWorkspaceFile,
  onDeleteWorkspacePath,
  onExpandAllFolders,
  onCollapseAllFolders,
}: WorkspaceSidebarProps) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [createMode, setCreateMode] = useState<"file" | "folder" | null>(null);
  const [createParentPath, setCreateParentPath] = useState<string | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!createMode) {
      return;
    }
    createInputRef.current?.focus();
    createInputRef.current?.select();
  }, [createMode]);

  const startRename = (path: string) => {
    const node = findNodeByPath(workspaceTree, path);
    if (!node) {
      return;
    }
    const suggestedName = node.path.split("/").filter(Boolean).slice(-1)[0];
    setEditingPath(path);
    setEditingValue(suggestedName ?? node.path);
  };

  const commitRename = (path: string) => {
    const node = findNodeByPath(workspaceTree, path);
    if (!node) {
      setEditingPath(null);
      setEditingValue("");
      return;
    }

    const nextName = editingValue.trim();
    if (!nextName) {
      setEditingPath(null);
      setEditingValue("");
      return;
    }

    const resolvedPath = resolveRenameTargetPath(node, nextName);
    if (resolvedPath !== node.path) {
      void onRenameWorkspacePath(node.path, resolvedPath);
      onSelectWorkspacePath(resolvedPath);
    }

    setEditingPath(null);
    setEditingValue("");
  };

  const commitCreate = async () => {
    const normalized = createValue
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (!normalized || !createMode) {
      setCreateMode(null);
      setCreateParentPath(null);
      setCreateValue("");
      return;
    }

    if (createMode === "file") {
      const filePath = joinPath(createParentPath ?? "", normalized);
      await onCreateWorkspaceFile(filePath, "# New file\n");
      onSelectWorkspacePath(filePath);
    } else {
      const folderPath = joinPath(createParentPath ?? "", normalized);
      const marker = classMarkerForFolder(folderPath);
      await onCreateWorkspaceFile(marker.path, marker.content);
      onSelectWorkspacePath(marker.path);
    }

    setCreateMode(null);
    setCreateParentPath(null);
    setCreateValue("");
  };

  const beginCreate = (targetPath: string, mode: "file" | "folder") => {
    const node = findNodeByPath(workspaceTree, targetPath);
    const baseDir =
      node?.type === "directory" ? node.path : parentDirectory(targetPath);

    if (baseDir) {
      const expanded = expandedFolders[baseDir] ?? true;
      if (!expanded) {
        onToggleFolder(baseDir);
      }
    }

    setCreateMode(mode);
    setCreateValue(mode === "file" ? "untitled.md" : "untitled");
    setCreateParentPath(baseDir);
  };

  return (
    <section>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-700">
        <span>{workspaceFilesCount} files</span>
        <div className="flex items-center gap-2">
          <button
            className="rounded p-1 transition hover:text-accent-600"
            type="button"
            onClick={onExpandAllFolders}
            aria-label="Open all folders"
            title="Open all folders"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button
            className="rounded p-1 transition hover:text-accent-600"
            type="button"
            onClick={onCollapseAllFolders}
            aria-label="Close all folders"
            title="Close all folders"
          >
            <FolderX className="h-4 w-4" />
          </button>
          <button
            className="rounded px-1 py-0.5 text-lg leading-none transition hover:text-accent-600"
            type="button"
            onClick={() => setSettingsOpen((current) => !current)}
            aria-label="Workspace settings"
            title="Workspace settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          {selectedWorkspaceNode ? (
            <button
              className="rounded px-1 py-0.5 text-base leading-none transition hover:text-accent-600"
              type="button"
              onClick={() => startRename(selectedWorkspaceNode.path)}
              aria-label="Rename selected"
              title="Rename selected"
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {settingsOpen ? (
        <div className="mb-2 rounded-lg border border-paper-300 bg-surface-muted p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <button
              className="rounded border border-paper-300 bg-surface-panel px-2 py-1 text-xs"
              type="button"
              onClick={() => {
                setShowResetConfirm(true);
                setSettingsOpen(false);
              }}
            >
              Reset workspace
            </button>
            <button
              className="rounded border border-paper-300 bg-surface-panel px-2 py-1 text-xs"
              type="button"
              onClick={() => {
                void onUndoWorkspaceReset();
                setSettingsOpen(false);
              }}
              disabled={!canUndoWorkspaceReset}
            >
              Undo reset
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        {createMode && (createParentPath ?? "") === "" ? (
          <input
            ref={createInputRef}
            className="mb-1 w-full rounded border border-accent-500 bg-surface-input px-1 py-0.5 text-xs"
            value={createValue}
            onChange={(event) => setCreateValue(event.target.value)}
            onBlur={() => {
              void commitCreate();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void commitCreate();
              }
              if (event.key === "Escape") {
                setCreateMode(null);
                setCreateParentPath(null);
                setCreateValue("");
              }
            }}
            aria-label={
              createMode === "file"
                ? "New file name input for root"
                : "New folder name input for root"
            }
          />
        ) : null}

        {workspaceTree.map((node) => (
          <WorkspaceTreeItem
            key={node.path}
            node={node}
            depth={0}
            activePath={activeFilePath}
            expandedFolders={expandedFolders}
            onToggleFolder={onToggleFolder}
            selectedPath={selectedWorkspacePath}
            onSelectPath={onSelectWorkspacePath}
            onOpenFile={onOpenWorkspaceFile}
            editingPath={editingPath}
            editingValue={editingValue}
            onEditingValueChange={setEditingValue}
            onEditingCommit={commitRename}
            onEditingCancel={() => {
              setEditingPath(null);
              setEditingValue("");
            }}
            createParentPath={createParentPath}
            createMode={createMode}
            createValue={createValue}
            onCreateValueChange={setCreateValue}
            onCreateCommit={() => {
              void commitCreate();
            }}
            onCreateCancel={() => {
              setCreateMode(null);
              setCreateParentPath(null);
              setCreateValue("");
            }}
            onStartRename={startRename}
            onStartCreate={beginCreate}
            onArchivePath={(path) => {
              if (window.confirm(`Archive ${path}?`)) {
                void onDeleteWorkspacePath(path);
              }
            }}
          />
        ))}
      </div>

      {workspaceError ? (
        <p className="mt-2 text-sm text-danger-700">{workspaceError}</p>
      ) : null}

      {showResetConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-overlay p-4">
          <div className="w-full max-w-md rounded-2xl border border-paper-200 bg-surface-panel p-4 shadow-xl">
            <h3 className="font-display text-lg">Reset workspace</h3>
            <p className="mt-2 text-sm text-ink-700">
              Are you sure you want to do this?
            </p>
            <p className="mt-1 text-xs text-ink-700">
              This restores the default scaffold and can remove custom files.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border border-paper-300 px-3 py-1 text-sm"
                type="button"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-danger-500 px-3 py-1 text-sm text-surface-panel"
                type="button"
                onClick={() => {
                  void onResetWorkspace();
                  setShowResetConfirm(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
