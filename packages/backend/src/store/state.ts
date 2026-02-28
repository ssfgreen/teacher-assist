import type { SessionRecord, Teacher } from "../types";

export const teachersByEmail = new Map<string, Teacher>();
export const teachersById = new Map<string, Teacher>();
export const sessionsById = new Map<string, SessionRecord>();

export const authTokens = new Map<
  string,
  { teacherId: string; expiresAt: number }
>();
export const rateLimitMap = new Map<
  string,
  { count: number; resetAt: number }
>();

export const MAX_REQUESTS_PER_MINUTE = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const AUTH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
