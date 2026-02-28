# Teacher Assist

Monorepo scaffold for the `teacher-assist` research prototype.

This repository currently includes Sprint 0, Sprint 1, and Sprint 2:
- Monorepo workspaces (`packages/backend`, `packages/frontend`)
- Bun + TypeScript setup
- Biome lint/format setup
- PostgreSQL Docker setup
- Backend auth/chat/session APIs
- Frontend login/chat/session UI
- Streaming responses (OpenAI + Anthropic + mock)
- Disk-backed session persistence across backend restarts
- Workspace file APIs with per-teacher PostgreSQL persistence
- System prompt assembly with injected workspace context (`soul.md`, profiles, class/curriculum files)
- Frontend workspace tab, file editor, class selector, and context-used indicator
- Frontend and backend critical-path automated tests

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

3. Create a root `.env` file with at least:

```bash
DATABASE_URL=postgres://teacher_assist:teacher_assist@localhost:5432/teacher_assist
```

4. Apply backend migrations (required on fresh machines):

```bash
cd packages/backend
bun run migrate
cd ../..
```

5. Verify lint passes:

```bash
bun run lint
```

6. Verify backend tests pass:

```bash
cd packages/backend
bun test
```

7. Build frontend:

```bash
cd packages/frontend
bun run build
```

8. Start backend API:

```bash
cd packages/backend
bun run dev
```

Expected backend output pattern:
`teacher-assist backend listening on http://localhost:3001`

9. Start frontend dev server (new terminal):

```bash
cd packages/frontend
bun run dev
```

## Sprint 2 Test Commands

Run these from repository root unless noted.

1. Full static + backend verification:

```bash
bun run lint
cd packages/backend && bun test
cd ../frontend && bun run test
bun run build
cd ../..
```

2. Start services for manual testing (use two terminals):

```bash
# Terminal 1
bun run dev:backend

# Terminal 2
bun run dev:frontend
```

3. Login credentials for local testing:

- Email: `teacher@example.com`
- Password: `password123`

4. Backend API smoke test with `curl`:

```bash
# login and save cookie
curl -i -c /tmp/teacher_assist.cookie \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"password123"}' \
  http://localhost:3001/api/auth/login

# check current user
curl -i -b /tmp/teacher_assist.cookie http://localhost:3001/api/auth/me

# create session
curl -i -b /tmp/teacher_assist.cookie \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","model":"gpt-4o"}' \
  http://localhost:3001/api/sessions

# send chat message (replace SESSION_ID)
curl -i -b /tmp/teacher_assist.cookie \
  -H "Content-Type: application/json" \
  -d '{"provider":"openai","model":"mock-openai","sessionId":"SESSION_ID","classRef":"3B","messages":[{"role":"user","content":"Plan a lesson on loops"}]}' \
  http://localhost:3001/api/chat

# list workspace tree
curl -i -b /tmp/teacher_assist.cookie http://localhost:3001/api/workspace

# update a class profile
curl -i -b /tmp/teacher_assist.cookie \
  -H "Content-Type: application/json" \
  -X PUT \
  -d '{"content":"# Class 3B\n- Subject: Computing Science"}' \
  http://localhost:3001/api/workspace/classes/3B.md
```

5. Real provider one-shot smoke check (streaming + log capture):

```bash
bun run smoke:providers
```

Optional env overrides:
- `SMOKE_OPENAI_MODEL` (default: `gpt-5-nano-2025-08-07`)
- `SMOKE_ANTHROPIC_MODEL` (default: `claude-haiku-4-5`)
- `SMOKE_MAX_TOKENS` (default: `80`)

Logs are written to:
- `packages/backend/.data/smoke/providers-<timestamp>.json`

## Sprint 2 Verification Checklist

- `bun install` completes without dependency errors
- `bun run lint` exits with code `0`
- `packages/backend` tests pass
- `packages/frontend` tests pass
- `packages/frontend` build passes
- Backend starts on `localhost:3001`
- Frontend starts on Vite default port and loads login screen
- Login works with demo credentials
- You can create/resume/delete sessions in the UI
- Chat requests return assistant responses
- Chat responses stream incrementally in the UI
- Sessions persist after backend restart
- Workspace tab shows seeded files (`soul.md`, `teacher.md`, `pedagogy.md`, `classes/`, `curriculum/`)
- Workspace file edits save and reload correctly
- Chat response contains workspace context metadata and UI indicator
- Class selector sends `classRef` to backend
- PostgreSQL container is healthy via `docker ps`

## Database Migrations

Sprint 0 includes:
- `packages/backend/db/migrations/001_teachers.sql`
- `packages/backend/db/migrations/002_sessions.sql`
- `packages/backend/db/migrations/003_workspace_files.sql`

Run migrations with:

```bash
cd packages/backend
bun run migrate
```

If you switch computers or recreate Docker volumes, rerun the migration command before starting the backend.

## Project Structure

- `packages/backend`: Bun + TS backend scaffold
- `packages/frontend`: Vite + React + TS frontend scaffold
- `specifications/`: product and engineering specifications
- `plugins/lesson-planning`: plugin content and skills
- `workspace/`: seed markdown files and local artifacts

## Current Limitations

- Auth tokens/rate-limit counters are in-memory (not persisted across backend restarts)
- Workspace editor now uses Milkdown (Crepe) for markdown editing
- Teachers/sessions are still persisted in local store JSON; workspace requires PostgreSQL
