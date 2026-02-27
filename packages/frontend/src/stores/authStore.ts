import { create } from "zustand";

interface TeacherProfile {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  teacher: TeacherProfile | null;
  loading: boolean;
  setTeacher: (teacher: TeacherProfile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  teacher: null,
  loading: false,
  setTeacher: (teacher) => set({ teacher }),
  setLoading: (loading) => set({ loading }),
}));
