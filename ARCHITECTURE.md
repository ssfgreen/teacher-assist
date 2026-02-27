# Architecture

## Overview

`teacher-assist` is a monorepo with a Bun backend and a Vite/React frontend.

- `packages/backend`: Auth, chat, sessions, workspace APIs, prompt assembly, provider adapters, streaming API.
- `packages/frontend`: Login/chat UI, session sidebar, workspace editor, model selection, streamed response rendering.

The current implementation is Sprint 0 + Sprint 1 + Sprint 2 with several hardening additions.

## Backend Runtime

The backend is a Bun HTTP server exposing `/api/*` routes.

### Auth

- Cookie-based auth with in-memory token map and TTL.
- Demo teacher seeded on startup (`teacher@example.com` / `password123`).
- Endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`

### Chat

`POST /api/chat` supports two modes and now injects workspace-derived system context:

- Non-stream mode: returns JSON `{ response, sessionId, workspaceContextLoaded }`.
- Stream mode (`stream: true`): returns SSE with events:
  - `start`
  - `delta`
  - `ping`
  - `done` (includes `workspaceContextLoaded`)
  - `error`

`POST /api/chat` accepts optional `maxTokens` and `classRef`, and forwards provider-appropriate token limit fields.

System prompt assembly order:
1. `<assistant-identity>` from `workspace/{teacherId}/soul.md` (with default fallback)
2. `<agent-instructions>` static planner instructions
3. `<workspace-context>` from teacher/pedagogy plus detected class/curriculum files

Provider integration:

- OpenAI: non-stream + true stream.
- Anthropic: non-stream + true stream.
- Mock models (`mock-*`): deterministic fake output for local testing.

Real model calls require provider API keys; missing keys return explicit config errors.

### Sessions

- Endpoints:
  - `POST /api/sessions`
  - `GET /api/sessions`
  - `GET /api/sessions/:id`
  - `PUT /api/sessions/:id`
  - `DELETE /api/sessions/:id`
- Session ownership is enforced per teacher.

Persistence strategy:

- Teachers and sessions are persisted to disk at `packages/backend/.data/store.json`.
- This enables persistence across backend restarts.
- Auth tokens and rate-limit counters remain in-memory.

### Workspace

- Workspace files are persisted in PostgreSQL (`workspace_files` table) keyed by `teacher_id` and `path`.
- Files are also mirrored to `workspace/{teacherId}/` for local inspectability and filesystem fallback.
- Defaults are seeded on login / first access:
  - `soul.md`
  - `teacher.md`
  - `pedagogy.md`
  - `classes/README.md`
  - `curriculum/README.md`
- Class profiles are expected at `classes/{classRef}/PROFILE.md`.
- Endpoints:
  - `GET /api/workspace`
  - `GET /api/workspace/*path`
  - `PUT /api/workspace/*path`
  - `DELETE /api/workspace/*path` (`soul.md` protected)
  - `POST /api/workspace/seed`

### Stability Notes

- SSE path is guarded against closed-controller enqueue errors.
- Server `idleTimeout` is increased for long-running streams.

## Smoke Validation

Backend includes a provider smoke command:

- `bun run smoke:providers`

It executes one streamed prompt per provider (OpenAI + Anthropic), captures success/error details, and writes logs to:

- `packages/backend/.data/smoke/providers-<timestamp>.json`

## Frontend Runtime

Single-page React app with Zustand state stores.

### Key Flows

- Login/logout with auth bootstrap (`/api/auth/me`).
- Session list, create, resume, delete.
- Sidebar has stacked workspace/session sections. Clicking a workspace markdown file opens the editor in the main (two-thirds) pane, with autosave + manual save.
- Chat send with streaming UX:
  - Creates in-progress assistant bubble.
  - Appends streamed deltas live.
  - Finalizes on `done` event.
- Chat hotkeys:
  - `Enter` sends.
  - `Shift+Enter` newline.
- Provider/model selector with localStorage persistence.
- Optional class selector (`classRef`) sourced from workspace class files.
- Context indicator showing which workspace files were used for the latest response.

### API Layer

- `api/auth.ts`
- `api/sessions.ts`
- `api/chat.ts` (includes SSE parser for stream mode)
- `api/workspace.ts`

## Testing Strategy

### Backend

- Bun tests cover auth, chat, sessions, workspace CRUD, prompt assembly/class extraction, provider switching, access control, stream mode, and key-missing errors.

### Frontend

- Vitest + React Testing Library tests cover Sprint 1 critical path:
  - login flow,
  - streamed chat flow,
  - session resume,
  - model/provider propagation,
  - auth/chat error handling,
  - workspace tab open/read flow,
  - classRef propagation,
  - context indicator rendering.

## Key Engineering Decisions

- Keep mock mode explicit by model selection rather than silent fallback.
- Stream by default in UI for better response UX.
- Persist sessions on disk now for reliability in local/dev workflows.
- Maintain non-stream chat path for compatibility and simpler fallback behavior.
