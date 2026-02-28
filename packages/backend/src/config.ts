const DEFAULT_DATABASE_URL =
  "postgres://teacher_assist:teacher_assist@localhost:5432/teacher_assist";

export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}
