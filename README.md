# Teacher Assist

Teacher Assist is a research-focused lesson planning assistant for teachers.
It combines persistent workspace context, session memory, and an agentic chat loop so planning is transparent, iterative, and reviewable.

## Quick Summary

- Monorepo with:
  - `packages/backend`: NestJS + Bun API
  - `packages/frontend`: React + Vite web app
  - `packages/shared`: shared cross-package types
- Persistent PostgreSQL storage for teachers, sessions, workspace files, and memory
- Streaming chat with tool-use transparency and inspectable traces in session metadata
- Workspace-first UX with editable markdown files (`soul.md`, teacher/class/curriculum context)
- Memory capture flow with teacher confirmation (`awaiting_memory_capture` / `no_new_memory`)

## Core Functionality

- Authentication and teacher-scoped data isolation
- Session-based chat with provider/model selection and streaming responses
- Agent loop with tool execution (`read_file`, `write_file`, `read_skill`, etc.)
- Progressive skill loading from `skills/`
- Workspace editor and class-aware context loading
- Teacher/class memory read/write and memory-capture confirmation flow
- Session search over persisted conversation content

## Key Docs

- Architecture overview: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Critical user flows and verification targets: [CRITICAL_PATHS.md](./CRITICAL_PATHS.md)
- Canonical sprint planning (frontend + backend aligned): [specifications/sprints/README.md](./specifications/sprints/README.md)
- Product and development specs:
  - [specifications/product-spec.md](./specifications/product-spec.md)
  - [specifications/dev-spec.md](./specifications/dev-spec.md)

## Prerequisites

- Bun `>=1.3`
- Docker Desktop (or Docker Engine)

## Getting Started from Scratch

1. Clone and enter the repo.

```bash
git clone <repo-url>
cd teacher-assist
```

2. Install dependencies.

```bash
bun install
```

3. Start PostgreSQL.

```bash
docker compose up -d
```

4. Create `.env` at repo root (optional but recommended).

If omitted, backend defaults to:

```bash
DATABASE_URL=postgres://teacher_assist:teacher_assist@localhost:5432/teacher_assist
```

5. Run database migrations.

```bash
cd packages/backend
bun run migrate
cd ../..
```

6. Run baseline verification.

```bash
bun run lint
cd packages/backend && bun test
cd ../frontend && bun run test
cd ../..
```

7. Start backend (terminal 1).

```bash
bun run dev:backend
```

8. Start frontend (terminal 2).

```bash
bun run dev:frontend
```

9. Sign in with local test credentials.

- Email: `teacher@example.com`
- Password: `password123`

## Useful Commands

- Lint everything: `bun run lint`
- Backend tests: `cd packages/backend && bun test`
- Frontend tests: `cd packages/frontend && bun run test`
- Frontend build: `cd packages/frontend && bun run build`
- Provider smoke test: `bun run smoke:providers`

## Notes

- Full backend integration tests require local PostgreSQL.
- Auth tokens and rate-limit counters are in-memory.
