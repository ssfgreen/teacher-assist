import { create } from "zustand";

import { login as loginApi, logout as logoutApi, me } from "../api/auth";
import type { TeacherProfile } from "../types";

interface AuthState {
  teacher: TeacherProfile | null;
  loading: boolean;
  error: string | null;
  initialise: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  teacher: null,
  loading: false,
  error: null,
  initialise: async () => {
    set({ loading: true, error: null });
    try {
      const teacher = await me();
      set({ teacher, loading: false });
    } catch {
      set({ teacher: null, loading: false });
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { teacher } = await loginApi(email, password);
      set({ teacher, loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Login failed",
      });
      throw error;
    }
  },
  logout: async () => {
    set({ loading: true, error: null });
    try {
      await logoutApi();
      set({ teacher: null, loading: false });
    } catch {
      set({ teacher: null, loading: false });
    }
  },
}));
