import bcrypt from "bcrypt";

import {
  createAuthToken,
  getTeacherByEmail,
  getTeacherById,
  readAuthToken,
  revokeAuthToken,
  upsertTeacher,
} from "./store";
import type { Teacher } from "./types";

const AUTH_COOKIE = "teacher_assist_auth";
const DEFAULT_EMAIL = "teacher@example.com";
const DEFAULT_NAME = "Demo Teacher";
const DEFAULT_PASSWORD = "password123";

let seeded = false;

export async function seedDefaultTeacher(): Promise<void> {
  if (seeded) {
    return;
  }

  const existing = getTeacherByEmail(DEFAULT_EMAIL);
  if (existing) {
    seeded = true;
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const teacher: Teacher = {
    id: crypto.randomUUID(),
    email: DEFAULT_EMAIL,
    name: DEFAULT_NAME,
    passwordHash,
  };

  upsertTeacher(teacher);
  seeded = true;
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; teacher: Omit<Teacher, "passwordHash"> } | null> {
  const teacher = getTeacherByEmail(email);
  if (!teacher) {
    return null;
  }

  const valid = await bcrypt.compare(password, teacher.passwordHash);
  if (!valid) {
    return null;
  }

  const token = createAuthToken(teacher.id);
  return {
    token,
    teacher: {
      id: teacher.id,
      email: teacher.email,
      name: teacher.name,
    },
  };
}

export function authenticateFromRequest(
  request: Request,
): Omit<Teacher, "passwordHash"> | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = readCookie(cookieHeader, AUTH_COOKIE);
  if (!token) {
    return null;
  }

  const teacherId = readAuthToken(token);
  if (!teacherId) {
    return null;
  }

  const teacher = getTeacherById(teacherId);
  if (!teacher) {
    return null;
  }

  return {
    id: teacher.id,
    email: teacher.email,
    name: teacher.name,
  };
}

export function logoutFromRequest(request: Request): void {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = readCookie(cookieHeader, AUTH_COOKIE);
  if (token) {
    revokeAuthToken(token);
  }
}

export function buildAuthSetCookie(token: string): string {
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

export function buildAuthClearCookie(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`;
}

export function resetAuthSeedForTests(): void {
  seeded = false;
}

function readCookie(cookieHeader: string, key: string): string | null {
  const pairs = cookieHeader.split(";").map((value) => value.trim());
  for (const pair of pairs) {
    if (!pair.includes("=")) {
      continue;
    }
    const [k, v] = pair.split("=", 2);
    if (k === key) {
      return decodeURIComponent(v);
    }
  }
  return null;
}
