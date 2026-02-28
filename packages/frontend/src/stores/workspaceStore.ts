import { create } from "zustand";

import {
  deleteWorkspaceFile,
  listWorkspace,
  readWorkspaceFile,
  renameWorkspacePath,
  seedWorkspace,
  writeWorkspaceFile,
} from "../api/workspace";
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
  initialise: () => Promise<void>;
  seed: () => Promise<void>;
  toggleFolder: (path: string) => void;
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;
  setOpenFileContent: (content: string) => void;
  saveOpenFile: () => Promise<void>;
  createFile: (path: string, content?: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
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

  renamePath: async (fromPath, toPath) => {
    set({ loading: true, error: null });
    try {
      await renameWorkspacePath(fromPath, toPath);
      const data = await fetchWorkspaceSnapshot();
      const currentOpenPath = get().openFilePath;
      const nextOpenPath = currentOpenPath
        ? mapRenamedPath(currentOpenPath, fromPath, toPath)
        : null;
      const nextSelectedContent = nextOpenPath
        ? (await readWorkspaceFile(nextOpenPath)).content
        : get().openFileContent;

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
