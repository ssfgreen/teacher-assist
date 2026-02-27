# Teacher Assist

Monorepo scaffold for the `teacher-assist` research prototype.

This repository currently includes Sprint 0 and Sprint 1:
- Monorepo workspaces (`packages/backend`, `packages/frontend`)
- Bun + TypeScript setup
- Biome lint/format setup
- PostgreSQL Docker setup
- Backend auth/chat/session APIs
- Frontend login/chat/session UI

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

5. Build frontend:

```bash
cd packages/frontend
bun run build
```

6. Start backend API:

```bash
cd packages/backend
bun run dev
```

Expected backend output pattern:
`teacher-assist backend listening on http://localhost:3001`

7. Start frontend dev server (new terminal):

```bash
cd packages/frontend
bun run dev
```

## Sprint 1 Test Commands

Run these from repository root unless noted.

1. Full static + backend verification:

```bash
bun run lint
cd packages/backend && bun test
cd ../frontend && bun run build
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
  -d '{"provider":"openai","model":"gpt-4o","sessionId":"SESSION_ID","messages":[{"role":"user","content":"Plan a lesson on loops"}]}' \
  http://localhost:3001/api/chat
```

## Sprint 1 Verification Checklist

- `bun install` completes without dependency errors
- `bun run lint` exits with code `0`
- `packages/backend` tests pass
- `packages/frontend` build passes
- Backend starts on `localhost:3001`
- Frontend starts on Vite default port and loads login screen
- Login works with demo credentials
- You can create/resume/delete sessions in the UI
- Chat requests return assistant responses
- PostgreSQL container is healthy via `docker ps`

## Database Migrations

Sprint 0 includes:
- `packages/backend/db/migrations/001_teachers.sql`
- `packages/backend/db/migrations/002_sessions.sql`

A migration runner is not wired yet. For manual application, use your preferred SQL client against the database from `docker-compose.yml`.

## Project Structure

- `packages/backend`: Bun + TS backend scaffold
- `packages/frontend`: Vite + React + TS frontend scaffold
- `specifications/`: product and engineering specifications
- `plugins/lesson-planning`: plugin content and skills
- `workspace/`: workspace content used by the assistant

## Current Limitations

- No migration runner wired yet
- Frontend automated tests are not added yet
