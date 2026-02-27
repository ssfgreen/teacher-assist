import { create } from "zustand";

import {
  createSession,
  listSessions,
  readSession,
  removeSession,
} from "../api/sessions";
import type { Provider, SessionRecord } from "../types";

interface SessionState {
  sessions: SessionRecord[];
  currentSession: SessionRecord | null;
  provider: Provider;
  model: string;
  loading: boolean;
  error: string | null;
  initialise: () => Promise<void>;
  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  createNewSession: () => Promise<SessionRecord>;
  selectSession: (id: string) => Promise<void>;
  upsertCurrentSession: (session: SessionRecord) => void;
  refreshSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

const MODEL_KEY = "teacher-assist:model";

function defaultModelForProvider(provider: Provider): string {
  return provider === "anthropic" ? "mock-anthropic" : "mock-openai";
}

function readModelPref(): { provider: Provider; model: string } {
  const raw = localStorage.getItem(MODEL_KEY);
  if (!raw) {
    return { provider: "openai", model: defaultModelForProvider("openai") };
  }

  try {
    const parsed = JSON.parse(raw) as { provider: Provider; model: string };
    if (!parsed.provider || !parsed.model) {
      return { provider: "openai", model: defaultModelForProvider("openai") };
    }
    return parsed;
  } catch {
    return { provider: "openai", model: defaultModelForProvider("openai") };
  }
}

function persistModelPref(provider: Provider, model: string): void {
  localStorage.setItem(MODEL_KEY, JSON.stringify({ provider, model }));
}

const modelPref = readModelPref();

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSession: null,
  provider: modelPref.provider,
  model: modelPref.model,
  loading: false,
  error: null,

  initialise: async () => {
    await get().refreshSessions();
  },

  setProvider: (provider) => {
    const model = get().model;
    persistModelPref(provider, model);
    set({ provider });
  },

  setModel: (model) => {
    const provider = get().provider;
    persistModelPref(provider, model);
    set({ model });
  },

  createNewSession: async () => {
    set({ loading: true, error: null });
    try {
      const created = await createSession(get().provider, get().model);
      const sessions = [created, ...get().sessions];
      set({ sessions, currentSession: created, loading: false });
      return created;
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to create session",
      });
      throw error;
    }
  },

  selectSession: async (id) => {
    set({ loading: true, error: null });
    try {
      const session = await readSession(id);
      set({ currentSession: session, loading: false });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load session",
      });
      throw error;
    }
  },

  upsertCurrentSession: (session) => {
    const next = [
      session,
      ...get().sessions.filter((item) => item.id !== session.id),
    ];
    set({ currentSession: session, sessions: next });
  },

  refreshSessions: async () => {
    set({ loading: true, error: null });
    try {
      const sessions = await listSessions();
      set({ sessions, loading: false });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load sessions",
      });
      throw error;
    }
  },

  deleteSession: async (id) => {
    set({ loading: true, error: null });
    try {
      await removeSession(id);
      const sessions = get().sessions.filter((session) => session.id !== id);
      const currentSession =
        get().currentSession?.id === id ? null : get().currentSession;
      set({ sessions, currentSession, loading: false });
    } catch (error) {
      set({
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to delete session",
      });
      throw error;
    }
  },
}));
