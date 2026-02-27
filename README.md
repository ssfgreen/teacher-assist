# Teacher Assist

Monorepo scaffold for the `teacher-assist` research prototype.

This repository currently includes Sprint 0 foundations:
- Monorepo workspaces (`packages/backend`, `packages/frontend`)
- Bun + TypeScript setup
- Biome lint/format setup
- PostgreSQL Docker setup
- Initial backend migrations and a basic backend test
- Frontend Vite + React + Tailwind scaffold

## Prerequisites

- Bun `>=1.3`
- Docker Desktop (or Docker Engine) for PostgreSQL

If `bun` is not on your shell path, you can run it directly via:
`/Users/s2852430/.bun/bin/bun`

## Quick Start

1. Install dependencies from repo root:

```bash
bun install
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Verify lint passes:

```bash
bun run lint
```

4. Verify backend tests pass:

```bash
cd packages/backend
bun test
```

5. Start frontend dev server:

```bash
cd packages/frontend
bun run dev
```

6. (Optional) Run backend scaffold entrypoint:

```bash
cd packages/backend
bun run dev
```

Expected backend output:
`teacher-assist backend scaffolding ready`

## Sprint 0 Verification Checklist

- `bun install` completes without dependency errors
- `bun run lint` exits with code `0`
- `packages/backend` tests pass (`1 pass` currently)
- Frontend dev server starts and serves the app shell
- Backend dev command prints scaffold message and exits cleanly
- PostgreSQL container is healthy via `docker ps`

## Database Migrations

Sprint 0 includes:
- `packages/backend/db/migrations/001_teachers.sql`
- `packages/backend/db/migrations/002_sessions.sql`

A migration runner is not wired yet in Sprint 0. For manual application, use your preferred SQL client against the database from `docker-compose.yml`.

## Project Structure

- `packages/backend`: Bun + TS backend scaffold
- `packages/frontend`: Vite + React + TS frontend scaffold
- `specifications/`: product and engineering specifications
- `plugins/lesson-planning`: plugin content and skills
- `workspace/`: workspace content used by the assistant

## Known Sprint 0 Limitations

- No auth or chat API yet (planned for Sprint 1)
- No migration runner wired yet
- Backend test suite is minimal scaffold coverage
