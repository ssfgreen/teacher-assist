const DEFAULT_DATABASE_URL =
  "postgres://teacher_assist:teacher_assist@localhost:5432/teacher_assist";
const DEFAULT_TRACE_VIEWER_ALLOWED_EMAILS = ["teacher@example.com"];

export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function resolveTraceViewerAllowedEmails(): string[] {
  const raw = process.env.TRACE_VIEWER_ALLOWED_EMAILS;
  if (!raw) {
    return DEFAULT_TRACE_VIEWER_ALLOWED_EMAILS;
  }

  const parsed = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : DEFAULT_TRACE_VIEWER_ALLOWED_EMAILS;
}
