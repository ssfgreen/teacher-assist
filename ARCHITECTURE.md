# Architecture

## Overview

`teacher-assist` is a monorepo with a Bun backend and a Vite/React frontend.

- `packages/backend`: Auth, chat, sessions, provider adapters, streaming API.
- `packages/frontend`: Login/chat UI, session sidebar, model selection, streamed response rendering.

The current implementation is Sprint 0 + Sprint 1 with several hardening additions.

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

`POST /api/chat` supports two modes:

- Non-stream mode: returns JSON `{ response, sessionId }`.
- Stream mode (`stream: true`): returns SSE with events:
  - `start`
  - `delta`
  - `ping`
  - `done`
  - `error`

`POST /api/chat` also accepts optional `maxTokens` and forwards provider-appropriate token limit fields.

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
- Chat send with streaming UX:
  - Creates in-progress assistant bubble.
  - Appends streamed deltas live.
  - Finalizes on `done` event.
- Chat hotkeys:
  - `Enter` sends.
  - `Shift+Enter` newline.
- Provider/model selector with localStorage persistence.

### API Layer

- `api/auth.ts`
- `api/sessions.ts`
- `api/chat.ts` (includes SSE parser for stream mode)

## Testing Strategy

### Backend

- Bun tests cover auth, chat, sessions, provider switching, access control, stream mode, and key-missing errors.

### Frontend

- Vitest + React Testing Library tests cover Sprint 1 critical path:
  - login flow,
  - streamed chat flow,
  - session resume,
  - model/provider propagation,
  - auth/chat error handling.

## Key Engineering Decisions

- Keep mock mode explicit by model selection rather than silent fallback.
- Stream by default in UI for better response UX.
- Persist sessions on disk now for reliability in local/dev workflows.
- Maintain non-stream chat path for compatibility and simpler fallback behavior.
