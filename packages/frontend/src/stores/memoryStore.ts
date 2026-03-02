import { create } from "zustand";

import {
  deleteMemoryFile,
  listMemory,
  readMemoryFile,
  writeMemoryFile,
} from "../api/memory";
import type { MemoryProposal, WorkspaceNode } from "../types";

interface MemoryDecision {
  proposalId: string;
  decision: "confirm" | "dismiss";
  text: string;
  scope: "teacher" | "class";
  classId?: string;
  category: "personal" | "pedagogical" | "class";
}

interface MemoryState {
  tree: WorkspaceNode[];
  openFilePath: string | null;
  openFileContent: string;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  proposals: MemoryProposal[];
  decisions: Record<string, MemoryDecision>;
  initialise: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeFile: () => void;
  setOpenFileContent: (content: string) => void;
  saveOpenFile: () => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  setProposals: (proposals: MemoryProposal[]) => void;
  confirmProposal: (proposalId: string) => void;
  dismissProposal: (proposalId: string) => void;
  editProposal: (proposalId: string, text: string) => void;
  confirmAll: () => void;
  dismissAll: () => void;
  removeProposal: (proposalId: string) => void;
  clearProposals: () => void;
  decisionList: () => MemoryDecision[];
}

function toDecision(proposal: MemoryProposal): MemoryDecision {
  return {
    proposalId: proposal.id,
    decision: "confirm",
    text: proposal.text,
    scope: proposal.scope,
    classId: proposal.classId,
    category: proposal.category,
  };
}

function memoryError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  tree: [],
  openFilePath: null,
  openFileContent: "",
  dirty: false,
  loading: false,
  saving: false,
  error: null,
  proposals: [],
  decisions: {},

  initialise: async () => {
    set({ loading: true, error: null });
    try {
      const data = await listMemory();
      set({ tree: data.tree, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: memoryError(error, "Failed to load memory"),
      });
    }
  },

  openFile: async (path) => {
    set({ loading: true, error: null });
    try {
      const file = await readMemoryFile(path);
      set({
        openFilePath: file.path,
        openFileContent: file.content,
        dirty: false,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: memoryError(error, "Failed to open memory file"),
      });
    }
  },

  closeFile: () => {
    set({ openFilePath: null, openFileContent: "", dirty: false });
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
      await writeMemoryFile(path, get().openFileContent);
      const data = await listMemory();
      set({ tree: data.tree, saving: false, dirty: false });
    } catch (error) {
      set({
        saving: false,
        error: memoryError(error, "Failed to save memory file"),
      });
    }
  },

  deleteFile: async (path) => {
    set({ loading: true, error: null });
    try {
      await deleteMemoryFile(path);
      const data = await listMemory();
      const shouldClose = get().openFilePath === path;
      set({
        tree: data.tree,
        loading: false,
        openFilePath: shouldClose ? null : get().openFilePath,
        openFileContent: shouldClose ? "" : get().openFileContent,
        dirty: shouldClose ? false : get().dirty,
      });
    } catch (error) {
      set({
        loading: false,
        error: memoryError(error, "Failed to delete memory file"),
      });
    }
  },

  setProposals: (proposals) => {
    const decisions = Object.fromEntries(
      proposals.map((proposal) => [proposal.id, toDecision(proposal)]),
    );
    set({ proposals, decisions });
  },

  confirmProposal: (proposalId) => {
    set((state) => {
      const existing = state.decisions[proposalId];
      if (!existing) {
        return {};
      }
      return {
        decisions: {
          ...state.decisions,
          [proposalId]: { ...existing, decision: "confirm" },
        },
      };
    });
  },

  dismissProposal: (proposalId) => {
    set((state) => {
      const existing = state.decisions[proposalId];
      if (!existing) {
        return {};
      }
      return {
        decisions: {
          ...state.decisions,
          [proposalId]: { ...existing, decision: "dismiss" },
        },
      };
    });
  },

  editProposal: (proposalId, text) => {
    set((state) => {
      const existing = state.decisions[proposalId];
      if (!existing) {
        return {};
      }
      return {
        decisions: {
          ...state.decisions,
          [proposalId]: { ...existing, text },
        },
      };
    });
  },

  confirmAll: () => {
    set((state) => ({
      decisions: Object.fromEntries(
        state.proposals.map((proposal) => [
          proposal.id,
          {
            ...state.decisions[proposal.id],
            decision: "confirm" as const,
          },
        ]),
      ),
    }));
  },

  dismissAll: () => {
    set((state) => ({
      decisions: Object.fromEntries(
        state.proposals.map((proposal) => [
          proposal.id,
          {
            ...state.decisions[proposal.id],
            decision: "dismiss" as const,
          },
        ]),
      ),
    }));
  },

  removeProposal: (proposalId) => {
    set((state) => {
      const nextProposals = state.proposals.filter(
        (proposal) => proposal.id !== proposalId,
      );
      const { [proposalId]: _ignored, ...nextDecisions } = state.decisions;
      return {
        proposals: nextProposals,
        decisions: nextDecisions,
      };
    });
  },

  clearProposals: () => {
    set({ proposals: [], decisions: {} });
  },

  decisionList: () => {
    const state = get();
    return state.proposals
      .map((proposal) => state.decisions[proposal.id])
      .filter((item): item is MemoryDecision => Boolean(item));
  },
}));
