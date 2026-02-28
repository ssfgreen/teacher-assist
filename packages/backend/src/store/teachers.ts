import type { Teacher } from "../types";
import { teachersByEmail, teachersById } from "./state";

export function upsertTeacherInMemory(teacher: Teacher): void {
  teachersByEmail.set(teacher.email.toLowerCase(), teacher);
  teachersById.set(teacher.id, teacher);
}

export function getTeacherByEmail(email: string): Teacher | null {
  return teachersByEmail.get(email.toLowerCase()) ?? null;
}

export function getTeacherById(id: string): Teacher | null {
  return teachersById.get(id) ?? null;
}
