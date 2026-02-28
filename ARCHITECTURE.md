# Architecture

## Overview

`teacher-assist` is a monorepo with a NestJS backend (running on Bun) and a Vite/React frontend.

- `packages/backend`: Auth, chat, sessions, workspace APIs, prompt assembly, provider adapters, streaming API.
- `packages/frontend`: Login/chat UI, session sidebar, workspace editor, model selection, streamed response rendering.

The current implementation is Sprint 0 + Sprint 1 + Sprint 2 + Sprint 3 (skills + agentic tool loop + transparent tool/skill UI).

## Backend Runtime

The backend runtime is a NestJS application (`@nestjs/core` + Express adapter) with domain-focused controllers/services under `packages/backend/src/modules/*`.
Database access is integrated with TypeORM (`@nestjs/typeorm`), with explicit entities under `src/typeorm/entities`.

- `AuthController` / `AuthService`
- `ChatController` / `ChatService`
- `SessionsController` / `SessionsService`
- `SkillsController` / `SkillsService`
- `WorkspaceController` / `WorkspaceService`

### Auth

- Cookie-based auth with in-memory token map and TTL.
- Demo teacher seeded on startup (`teacher@example.com` / `password123`).
- Endpoints:
  - `POST /api/auth/login`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`

### Chat

`POST /api/chat` supports two modes, injects workspace-derived system context, and now runs through an agent loop:

- Non-stream mode: returns JSON `{ response, sessionId, messages, skillsLoaded, workspaceContextLoaded }`.
- Stream mode (`stream: true`): returns SSE with events:
  - `start`
  - `delta`
  - `ping`
  - `done` (includes full response payload above)
  - `error`

`POST /api/chat` accepts optional `maxTokens` and `classRef`, and forwards provider-appropriate token limit fields.

System prompt assembly order:
1. `<assistant-identity>` from workspace `soul.md` (with default fallback)
2. `<agent-instructions>` static planner instructions
3. `<workspace-context>` from teacher/pedagogy plus class/curriculum catalogs (progressive loading; full files fetched later via tools)
4. `<skill-manifest>` from discovered skills folder
5. `<tool-instructions>` generated from tool registry

Agent loop behavior:

- `runAgentLoop` calls model repeatedly until no tool calls are returned.
- Built-in tools are dispatched via `tools/registry.ts`.
- Safety limits enforced: `maxTurns` and `maxBudgetUsd`.
- Tool results are stored as `role: "tool"` messages and persisted to sessions.
- For class-targeted prompts, system instructions tell the model to prefer reading `classes/{classRef}/CLASS.md` before making class-specific claims (without hard-enforcing a tool call).
- Context is maintained by an explicit runtime context state (history, tool lifecycle, task progress, feedback, summary metrics).
- Loop resilience controls prevent unproductive cycles:
  - per-chain tool retry cap (`maxToolRetries`)
  - no-progress iteration cap (`maxNoProgressIterations`)
  - optional forced finalization path (`forceFinalizeOnStall`) for best-effort completion.

Provider integration:

- OpenAI: non-stream + true stream.
- Anthropic: non-stream + true stream.
- Mock models (`mock-*`): deterministic fake output for local testing.
- Mock agentic models (`mock-agentic-*`): deterministic tool-call sequences for Sprint 3 loop testing.
- Real-provider non-stream requests now include tool definitions, and native tool calls are parsed back into internal `toolCalls`.

Real model calls require provider API keys; missing keys return explicit config errors.

### Sessions

- Endpoints:
  - `POST /api/sessions`
  - `GET /api/sessions`
  - `GET /api/sessions/:id`
  - `PUT /api/sessions/:id`
  - `DELETE /api/sessions/:id`
- Session ownership is enforced per teacher.
- Session records now include persisted task state (`tasks`) used by `update_tasks`.
- Session records also persist runtime metadata used by the UI across logins:
  - `traceHistory`
  - `contextHistory`
  - `activeSkills`

Persistence strategy:

- Teachers and sessions are persisted in PostgreSQL (`teachers`, `sessions`) via TypeORM-backed repositories.
- Auth tokens and rate-limit counters remain in-memory.

### Workspace

- Workspace files are persisted in PostgreSQL (`workspace_files` table) keyed by `(teacher_id, path)` with `teacher_id` as UUID FK to `teachers(id)`.
- Backend startup requires PostgreSQL workspace storage to be reachable and migrated (`bun run migrate`).
- Defaults are seeded on login / first access:
  - `soul.md`
  - `teacher.md`
  - `pedagogy.md`
  - `classes/README.md`
  - `curriculum/README.md`
- Class profiles are expected at `classes/{classRef}/CLASS.md`.
- Endpoints:
  - `GET /api/workspace`
  - `POST /api/workspace/reset`
  - `GET /api/workspace/*path`
  - `PUT /api/workspace/*path`
  - `DELETE /api/workspace/*path` (`soul.md` protected)
  - `POST /api/workspace/seed`

### Skills

- Skills are discovered from repo-root `skills/{skillName}` with cwd-aware fallback for backend test/runtime entrypoints.
- `SKILL.md` frontmatter `description` fields are used to build Tier 1 manifest.
- `read_skill` supports:
  - Tier 2: `skill-name` -> `SKILL.md`
  - Tier 3: `skill-name/file.md` -> referenced file content
- Skill references can be expanded recursively with depth and circular-reference guards.
- Endpoint:
  - `GET /api/skills` (authenticated) returns manifest for frontend `Skills` tab.

### Planned Memory Runtime Enhancements

- Introduce short-term vs long-term memory handling with end-of-session consolidation.
- Rank retrieved memory snippets by relevance, importance, recency, and access frequency before prompt injection.
- Persist memory selection and consolidation decisions into traces for observability.

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
- Sidebar has stacked workspace/session sections. Clicking a workspace markdown file opens the workspace markdown editor in the main (two-thirds) pane, with autosave + manual save.
- Workspace sidebar includes destructive reset flow behind a confirmation modal, with one-step undo immediately after reset.
- Chat send with streaming UX:
  - Creates in-progress assistant bubble.
  - Appends streamed deltas live.
  - Finalizes on `done` event.
  - Renders sectioned assistant outputs (`## Starter`, `## Main Activity`, `## Plenary`) as distinct section cards.
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
  - context indicator rendering,
  - tool-call timeline rendering,
  - section-card rendering for structured assistant lesson outputs,
  - active-skill highlighting in the `Skills` tab.

## Key Engineering Decisions

- Keep mock mode explicit by model selection rather than silent fallback.
- Keep Sprint 3 tool execution transparent by returning and rendering the full message chain.
- Stream by default in UI for better response UX.
- Persist sessions in PostgreSQL for reliability and cross-process consistency.
- Maintain non-stream chat path for compatibility and simpler fallback behavior.
