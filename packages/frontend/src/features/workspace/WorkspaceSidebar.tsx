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
  onSeedWorkspace: () => Promise<void>;
  onRenameWorkspacePath: (fromPath: string, toPath: string) => Promise<void>;
  onCreateWorkspaceFile: (path: string, content?: string) => Promise<void>;
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
  onSeedWorkspace,
  onRenameWorkspacePath,
  onCreateWorkspaceFile,
}: WorkspaceSidebarProps) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg">Workspace</h2>
        <div className="flex gap-1">
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => void onSeedWorkspace()}
          >
            Seed
          </button>
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => {
              if (!selectedWorkspaceNode) {
                return;
              }

              const suggestedName = selectedWorkspaceNode.path
                .split("/")
                .filter(Boolean)
                .at(-1);
              const nextPath = window.prompt(
                "Rename to (name or path)",
                suggestedName ?? selectedWorkspaceNode.path,
              );
              if (!nextPath) {
                return;
              }

              const resolvedPath = resolveRenameTargetPath(
                selectedWorkspaceNode,
                nextPath,
              );
              void onRenameWorkspacePath(
                selectedWorkspaceNode.path,
                resolvedPath,
              );
              onSelectWorkspacePath(resolvedPath);
            }}
            disabled={!selectedWorkspaceNode}
          >
            Rename
          </button>
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => {
              const folderName = window.prompt(
                "Folder name (or relative path)",
                "new-folder",
              );
              if (!folderName) {
                return;
              }

              const normalizedFolder = folderName
                .trim()
                .replace(/^\/+/, "")
                .replace(/\/+$/, "");
              if (!normalizedFolder) {
                return;
              }

              const baseDir =
                selectedWorkspaceNode?.type === "directory"
                  ? selectedWorkspaceNode.path
                  : selectedWorkspaceNode
                    ? parentDirectory(selectedWorkspaceNode.path)
                    : "";
              const folderPath = joinPath(baseDir, normalizedFolder);
              void onCreateWorkspaceFile(
                `${folderPath}/README.md`,
                "# Folder Notes\n\n",
              );
            }}
          >
            New Folder
          </button>
          <button
            className="rounded-lg border border-paper-100 px-2 py-1 text-xs"
            type="button"
            onClick={() => {
              const fileName = window.prompt(
                "File name (or relative path)",
                "new-file.md",
              );
              if (!fileName) {
                return;
              }

              const normalizedFile = fileName
                .trim()
                .replace(/^\/+/, "")
                .replace(/\/+$/, "");
              if (!normalizedFile) {
                return;
              }

              const baseDir =
                selectedWorkspaceNode?.type === "directory"
                  ? selectedWorkspaceNode.path
                  : selectedWorkspaceNode
                    ? parentDirectory(selectedWorkspaceNode.path)
                    : "";
              const filePath = joinPath(baseDir, normalizedFile);
              void onCreateWorkspaceFile(filePath, "# New file\n");
            }}
          >
            New File
          </button>
        </div>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-paper-100 p-2">
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
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-800">{workspaceFilesCount} files</p>

      {workspaceError ? (
        <p className="mt-2 text-xs text-red-700">{workspaceError}</p>
      ) : null}
    </section>
  );
}
