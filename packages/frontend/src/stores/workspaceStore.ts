import { create } from "zustand";

import {
  deleteWorkspaceFile,
  listWorkspace,
  readWorkspaceFile,
  renameWorkspacePath,
  resetWorkspace,
  seedWorkspace,
  writeWorkspaceFile,
} from "../api/workspace";
import { collectFiles } from "../features/workspace/path-utils";
import type { WorkspaceNode } from "../types";

let latestOpenFileRequestId = 0;

interface WorkspaceState {
  tree: WorkspaceNode[];
  classRefs: string[];
  openFilePath: string | null;
  openFileContent: string;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  expandedFolders: Record<string, boolean>;
  canUndoReset: boolean;
  initialise: () => Promise<void>;
  seed: () => Promise<void>;
  reset: () => Promise<void>;
  undoReset: () => Promise<void>;
  toggleFolder: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;
  setOpenFileContent: (content: string) => void;
  saveOpenFile: () => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  renamePath: (fromPath: string, toPath: string) => Promise<void>;
}

function workspaceError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mapRenamedPath(
  path: string,
  fromPath: string,
  toPath: string,
): string {
  if (path === fromPath) {
    return toPath;
  }

  const prefix = fromPath.endsWith("/") ? fromPath : `${fromPath}/`;
  if (!path.startsWith(prefix)) {
    return path;
  }

  const suffix = path.slice(prefix.length);
  const toPrefix = toPath.endsWith("/") ? toPath : `${toPath}/`;
  return `${toPrefix}${suffix}`;
}

function filePathsUnderPath(
  tree: WorkspaceNode[],
  targetPath: string,
): string[] {
  const walk = (node: WorkspaceNode): string[] => {
    if (node.type === "file") {
      return [node.path];
    }
    const files: string[] = [];
    for (const child of node.children ?? []) {
      files.push(...walk(child));
    }
    return files;
  };

  const find = (nodes: WorkspaceNode[]): WorkspaceNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node;
      }
      if (node.type === "directory") {
        const found = find(node.children ?? []);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  const target = find(tree);
  if (!target) {
    return [];
  }
  return walk(target);
}

async function fetchWorkspaceSnapshot(): Promise<{
  tree: WorkspaceNode[];
  classRefs: string[];
}> {
  return listWorkspace();
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  tree: [],
  classRefs: [],
  openFilePath: null,
  openFileContent: "",
  dirty: false,
  loading: false,
  saving: false,
  error: null,
  expandedFolders: {
    classes: true,
    curriculum: true,
  },
  canUndoReset: false,

  initialise: async () => {
    set({ loading: true, error: null });
    try {
      const data = await fetchWorkspaceSnapshot();
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to load workspace"),
      });
    }
  },

  seed: async () => {
    set({ loading: true, error: null });
    try {
      await seedWorkspace();
      const data = await fetchWorkspaceSnapshot();
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to seed workspace"),
      });
    }
  },

  reset: async () => {
    set({ loading: true, error: null });
    try {
      const currentPaths = collectFiles(get().tree);
      const backup: Array<{ path: string; content: string }> = [];
      for (const path of currentPaths) {
        const file = await readWorkspaceFile(path);
        backup.push({ path: file.path, content: file.content });
      }

      await resetWorkspace();
      const data = await fetchWorkspaceSnapshot();

      set({
        tree: data.tree,
        classRefs: data.classRefs,
        openFilePath: null,
        openFileContent: "",
        dirty: false,
        loading: false,
        canUndoReset: backup.length > 0,
      });

      // stash backup in closure for one-step undo
      lastResetBackup = backup;
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to reset workspace"),
      });
    }
  },

  undoReset: async () => {
    if (!lastResetBackup || lastResetBackup.length === 0) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const currentPaths = collectFiles(get().tree);
      const backupMap = new Map(
        lastResetBackup.map((item) => [item.path, item]),
      );

      for (const item of lastResetBackup) {
        await writeWorkspaceFile(item.path, item.content);
      }

      for (const path of currentPaths) {
        if (!backupMap.has(path)) {
          await deleteWorkspaceFile(path);
        }
      }

      const data = await fetchWorkspaceSnapshot();
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        openFilePath: null,
        openFileContent: "",
        dirty: false,
        loading: false,
        canUndoReset: false,
      });
      lastResetBackup = null;
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to undo workspace reset"),
      });
    }
  },

  toggleFolder: (path) => {
    set((state) => ({
      expandedFolders: {
        ...state.expandedFolders,
        [path]: !state.expandedFolders[path],
      },
    }));
  },

  openFile: async (path) => {
    const requestId = ++latestOpenFileRequestId;
    set({ loading: true, error: null });
    try {
      const file = await readWorkspaceFile(path);
      if (requestId !== latestOpenFileRequestId) {
        return;
      }
      set({
        openFilePath: file.path,
        openFileContent: file.content,
        dirty: false,
        loading: false,
      });
    } catch (error) {
      if (requestId !== latestOpenFileRequestId) {
        return;
      }
      set({
        loading: false,
        error: workspaceError(error, "Failed to open workspace file"),
      });
    }
  },

  closeFile: () => {
    set({
      openFilePath: null,
      openFileContent: "",
      dirty: false,
    });
  },

  setOpenFileContent: (content) => {
    set({ openFileContent: content, dirty: true });
  },

  saveOpenFile: async () => {
    const path = get().openFilePath;
    if (!path) {
      return;
    }

    set({ saving: true, error: null });
    try {
      await writeWorkspaceFile(path, get().openFileContent);
      const data = await fetchWorkspaceSnapshot();
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        dirty: false,
        saving: false,
      });
    } catch (error) {
      set({
        saving: false,
        error: workspaceError(error, "Failed to save workspace file"),
      });
    }
  },

  createFile: async (path, content = "# New file\n") => {
    set({ loading: true, error: null });
    try {
      await writeWorkspaceFile(path, content);
      const data = await fetchWorkspaceSnapshot();
      const file = await readWorkspaceFile(path);
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        openFilePath: file.path,
        openFileContent: file.content,
        dirty: false,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to create workspace file"),
      });
    }
  },

  deleteFile: async (path) => {
    set({ loading: true, error: null });
    try {
      await deleteWorkspaceFile(path);
      const data = await fetchWorkspaceSnapshot();
      const shouldClose = get().openFilePath === path;
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        openFilePath: shouldClose ? null : get().openFilePath,
        openFileContent: shouldClose ? "" : get().openFileContent,
        dirty: shouldClose ? false : get().dirty,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to delete workspace file"),
      });
    }
  },

  deletePath: async (path) => {
    set({ loading: true, error: null });
    try {
      const currentTree = get().tree;
      const paths = filePathsUnderPath(currentTree, path);
      const targets = paths.length > 0 ? paths : [path];

      for (const target of targets) {
        await deleteWorkspaceFile(target);
      }

      const data = await fetchWorkspaceSnapshot();
      const currentOpenPath = get().openFilePath;
      const shouldClose = Boolean(
        currentOpenPath &&
          (targets.includes(currentOpenPath) ||
            currentOpenPath.startsWith(`${path}/`)),
      );
      set({
        tree: data.tree,
        classRefs: data.classRefs,
        openFilePath: shouldClose ? null : currentOpenPath,
        openFileContent: shouldClose ? "" : get().openFileContent,
        dirty: shouldClose ? false : get().dirty,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to delete workspace path"),
      });
    }
  },

  renamePath: async (fromPath, toPath) => {
    set({ loading: true, error: null });
    try {
      await renameWorkspacePath(fromPath, toPath);
      const data = await fetchWorkspaceSnapshot();
      const currentOpenPath = get().openFilePath;
      const nextOpenPath = currentOpenPath
        ? mapRenamedPath(currentOpenPath, fromPath, toPath)
        : null;
      let nextSelectedContent = get().openFileContent;
      if (nextOpenPath) {
        try {
          nextSelectedContent = (await readWorkspaceFile(nextOpenPath)).content;
        } catch {
          nextSelectedContent = "";
        }
      }

      set({
        tree: data.tree,
        classRefs: data.classRefs,
        openFilePath: nextOpenPath,
        openFileContent: nextOpenPath ? nextSelectedContent : "",
        dirty: false,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: workspaceError(error, "Failed to rename workspace path"),
      });
    }
  },
}));

let lastResetBackup: Array<{ path: string; content: string }> | null = null;
