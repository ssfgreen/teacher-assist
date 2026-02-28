import { useEffect, useRef, useState } from "react";

import type { WorkspaceNode } from "../../types";
import WorkspaceTreeItem from "./WorkspaceTreeItem";
import {
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
}: WorkspaceSidebarProps) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [createMode, setCreateMode] = useState<"file" | "folder" | null>(null);
  const [createParentPath, setCreateParentPath] = useState<string | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [deleteArmedPath, setDeleteArmedPath] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const createInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedWorkspaceNode) {
      setDeleteArmedPath(null);
      return;
    }
    if (deleteArmedPath !== selectedWorkspaceNode.path) {
      setDeleteArmedPath(null);
    }
  }, [selectedWorkspaceNode, deleteArmedPath]);

  useEffect(() => {
    if (!createMode) {
      return;
    }
    createInputRef.current?.focus();
    createInputRef.current?.select();
  }, [createMode]);

  const startRename = () => {
    if (!selectedWorkspaceNode) {
      return;
    }
    const suggestedName = selectedWorkspaceNode.path
      .split("/")
      .filter(Boolean)
      .slice(-1)[0];
    setEditingPath(selectedWorkspaceNode.path);
    setEditingValue(suggestedName ?? selectedWorkspaceNode.path);
  };

  const commitRename = (path: string) => {
    if (!selectedWorkspaceNode || path !== selectedWorkspaceNode.path) {
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

    const resolvedPath = resolveRenameTargetPath(
      selectedWorkspaceNode,
      nextName,
    );
    if (resolvedPath !== selectedWorkspaceNode.path) {
      void onRenameWorkspacePath(selectedWorkspaceNode.path, resolvedPath);
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
      setCreateMode(null);
      setCreateParentPath(null);
      setCreateValue("");
      return;
    }

    const folderPath = joinPath(createParentPath ?? "", normalized);
    const markerFile = folderPath.startsWith("classes/")
      ? `${folderPath}/CLASS.md`
      : `${folderPath}/README.md`;
    const markerContent = markerFile.endsWith("/CLASS.md")
      ? "# Class Profile\n\n- Class:\n- Stage:\n- Notes:\n"
      : "# Folder Notes\n\n";
    await onCreateWorkspaceFile(markerFile, markerContent);
    onSelectWorkspacePath(markerFile);
    setCreateMode(null);
    setCreateParentPath(null);
    setCreateValue("");
  };

  const handleDelete = async () => {
    if (!selectedWorkspaceNode) {
      return;
    }
    if (deleteArmedPath !== selectedWorkspaceNode.path) {
      setDeleteArmedPath(selectedWorkspaceNode.path);
      return;
    }
    await onDeleteWorkspacePath(selectedWorkspaceNode.path);
    setDeleteArmedPath(null);
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg">Workspace</h2>
        <div className="flex gap-1">
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            aria-label="Workspace settings"
            title="Workspace settings"
          >
            ⚙
          </button>
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={startRename}
            disabled={!selectedWorkspaceNode}
            aria-label="Rename selected"
            title="Rename selected"
          >
            ✎
          </button>
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => {
              const baseDir =
                selectedWorkspaceNode?.type === "directory"
                  ? selectedWorkspaceNode.path
                  : selectedWorkspaceNode
                    ? parentDirectory(selectedWorkspaceNode.path)
                    : "";
              if (baseDir && selectedWorkspaceNode?.type === "directory") {
                const expanded = expandedFolders[baseDir] ?? true;
                if (!expanded) {
                  onToggleFolder(baseDir);
                }
              }
              setCreateMode("folder");
              setCreateValue("untitled");
              setCreateParentPath(baseDir);
            }}
            aria-label="Create folder"
            title="Create folder"
          >
            ⊞
          </button>
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => {
              const baseDir =
                selectedWorkspaceNode?.type === "directory"
                  ? selectedWorkspaceNode.path
                  : selectedWorkspaceNode
                    ? parentDirectory(selectedWorkspaceNode.path)
                    : "";
              if (baseDir && selectedWorkspaceNode?.type === "directory") {
                const expanded = expandedFolders[baseDir] ?? true;
                if (!expanded) {
                  onToggleFolder(baseDir);
                }
              }
              setCreateMode("file");
              setCreateValue("untitled.md");
              setCreateParentPath(baseDir);
            }}
            aria-label="Create file"
            title="Create file"
          >
            ＋
          </button>
          <button
            className={`rounded-lg border px-2 py-1 text-xs ${deleteArmedPath === selectedWorkspaceNode?.path ? "border-red-500 text-red-700" : "border-paper-100"}`}
            type="button"
            onClick={() => void handleDelete()}
            disabled={!selectedWorkspaceNode}
            aria-label="Delete selected"
            title="Delete selected"
          >
            ⌫
          </button>
        </div>
      </div>
      {settingsOpen ? (
        <div className="mb-2 rounded-lg border border-paper-100 bg-white p-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <button
              className="rounded border border-paper-100 px-2 py-1 text-xs"
              type="button"
              onClick={() => {
                setShowResetConfirm(true);
                setSettingsOpen(false);
              }}
            >
              Reset workspace
            </button>
            <button
              className="rounded border border-paper-100 px-2 py-1 text-xs"
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
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-paper-100 p-2">
        {createMode && (createParentPath ?? "") === "" ? (
          <input
            ref={createInputRef}
            className="mb-1 w-full rounded border border-accent-600 bg-white px-1 py-0.5 text-xs"
            value={createValue}
            onChange={(event) => setCreateValue(event.target.value)}
            onBlur={() => void commitCreate()}
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
                ? "New file name input"
                : "New folder name input"
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
            onCreateCommit={() => void commitCreate()}
            onCreateCancel={() => {
              setCreateMode(null);
              setCreateParentPath(null);
              setCreateValue("");
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-800">{workspaceFilesCount} files</p>
      {deleteArmedPath ? (
        <p className="mt-1 text-xs text-red-700">
          Press delete again to confirm.
        </p>
      ) : null}

      {workspaceError ? (
        <p className="mt-2 text-xs text-red-700">{workspaceError}</p>
      ) : null}
      {showResetConfirm ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg border border-paper-100 bg-white p-4 shadow-lg">
            <p className="text-sm font-medium">
              Are you sure you want to do this?
            </p>
            <p className="mt-2 text-xs text-ink-800">
              Reset workspace will restore default files and remove current
              custom files. You can undo once immediately after reset.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-paper-100 px-2 py-1 text-xs"
                type="button"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded border border-red-500 px-2 py-1 text-xs text-red-700"
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  void onResetWorkspace();
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
