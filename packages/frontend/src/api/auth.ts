import type { TeacherProfile } from "../types";
import { apiFetch } from "./client";

export async function login(
  email: string,
  password: string,
): Promise<{ teacher: TeacherProfile }> {
  return apiFetch<{ teacher: TeacherProfile }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export async function me(): Promise<TeacherProfile> {
  return apiFetch<TeacherProfile>("/api/auth/me");
}
