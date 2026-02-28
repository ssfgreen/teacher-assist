import { randomUUID } from "node:crypto";

import { AUTH_TOKEN_TTL_MS, authTokens } from "./state";

export function createAuthToken(teacherId: string): string {
  const token = randomUUID();
  authTokens.set(token, {
    teacherId,
    expiresAt: Date.now() + AUTH_TOKEN_TTL_MS,
  });
  return token;
}

export function readAuthToken(token: string): string | null {
  const record = authTokens.get(token);
  if (!record) {
    return null;
  }
  if (record.expiresAt < Date.now()) {
    authTokens.delete(token);
    return null;
  }
  return record.teacherId;
}

export function revokeAuthToken(token: string): void {
  authTokens.delete(token);
}
