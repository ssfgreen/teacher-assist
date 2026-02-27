import { create } from "zustand";

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface SessionState {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  setSessions: (sessions: SessionSummary[]) => void;
  setCurrentSessionId: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
}));
