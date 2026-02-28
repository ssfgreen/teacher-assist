import {
  MAX_REQUESTS_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  rateLimitMap,
} from "./state";

export function checkRateLimit(teacherId: string): {
  limited: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const existing = rateLimitMap.get(teacherId);
  if (!existing || existing.resetAt < now) {
    rateLimitMap.set(teacherId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { limited: false };
  }

  if (existing.count >= MAX_REQUESTS_PER_MINUTE) {
    return {
      limited: true,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { limited: false };
}
