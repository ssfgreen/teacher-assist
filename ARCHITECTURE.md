# Architecture

## Overview

`teacher-assist` is a monorepo with a NestJS backend (running on Bun) and a Vite/React frontend.

- `packages/backend`: Auth, chat, sessions, workspace/memory APIs, prompt assembly, provider adapters, streaming API.
- `packages/frontend`: Login/chat UI, session/sidebar panels, workspace + memory editor, model selection, streamed response rendering.

The current implementation is Sprint 0 through Sprint 5.1 (including Sprint 3.5 layout refresh, Sprint 4 full-loop streaming UX, Sprint 5 memory + session-search flows, and Sprint 5.1 preference-memory extraction/UI updates).

Shared cross-package types live in `packages/shared/types.ts` and are consumed by both backend and frontend type modules.

## Backend Runtime

The backend runtime is a NestJS application (`@nestjs/core` + Express adapter) with domain-focused controllers/services under `packages/backend/src/modules/*`.
Database access is integrated with TypeORM (`@nestjs/typeorm`), with explicit entities under `src/typeorm/entities`.

- `AuthController` / `AuthService`
- `ChatController` / `ChatService`
- `SessionsController` / `SessionsService`
- `SkillsController` / `SkillsService`
- `MemoryController` / `MemoryService`
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

- Non-stream mode: returns JSON `{ response, status, proposals?, sessionId, messages, skillsLoaded, workspaceContextLoaded, memoryContextLoaded }`.
- Stream mode (`stream: true`): returns SSE with events:
  - `start`
  - `delta`
  - `message` (tool-step messages as they are emitted by the loop)
  - `ping`
  - `done` (includes full response payload above)
  - `error`

`POST /api/chat` accepts optional `maxTokens` and `classRef`, and forwards provider-appropriate token limit fields.

System prompt assembly order:
1. `<assistant-identity>` from workspace `soul.md` (with default fallback)
2. `<agent-instructions>` static planner instructions
3. `<workspace-context>` from teacher/pedagogy plus class/curriculum catalogs (progressive loading; full files fetched later via tools)
4. `<teacher-memory>` (first 200 lines of `MEMORY.md` when present)
5. `<class-memory>` (first 200 lines of `classes/{classRef}/MEMORY.md` when present)
6. `<skill-manifest>` from discovered skills folder
7. `<tool-instructions>` generated from tool registry

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
  - `memoryContextHistory`
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

### Memory

- Memory files are persisted in PostgreSQL (`memory_files`) with teacher isolation and optional class scope.
- Memory event audit log is persisted in `memory_events`.
- Virtual path examples:
  - `MEMORY.md`
  - `classes/3B/MEMORY.md`
- Endpoints:
  - `GET /api/memory`
  - `GET /api/memory/*path`
  - `PUT /api/memory/*path`
  - `DELETE /api/memory/*path`
  - `POST /api/chat/memory-response` (confirm/dismiss memory proposals)

### Skills

- Skills are discovered from repo-root `skills/{skillName}` with cwd-aware fallback for backend test/runtime entrypoints.
- `SKILL.md` frontmatter `description` fields are used to build Tier 1 manifest.
- `read_skill` supports:
  - Tier 2: `skill-name` -> `SKILL.md`
  - Tier 3: `skill-name/file.md` -> referenced file content
- Skill references can be expanded recursively with depth and circular-reference guards.
- Endpoint:
  - `GET /api/skills` (authenticated) returns manifest for the frontend sidebar `Skills` section.

### Session Search

- Session text search uses `sessions.search_vector` (`tsvector`) with GIN index.
- Search API is exposed via `GET /api/sessions/search/query` and tool `search_sessions`.

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
- Full-height, resizable sidebar (default ~20%, draggable) with unified collapsible sections for workspace, sessions, skills, and memory.
- Sidebar includes global workspace tree controls (`Open all folders` / `Close all folders`) and logout anchored at the bottom-left.
- Clicking a workspace markdown file opens the workspace markdown editor in the main pane, with autosave + manual save.
- Workspace sidebar includes destructive reset flow behind a confirmation modal, with one-step undo immediately after reset.
- Chat send with streaming UX:
  - Creates in-progress assistant bubble.
  - Appends streamed deltas live.
  - Appends streamed tool-step messages in-order.
  - Finalizes on `done` event.
  - Renders sectioned assistant outputs (`## Starter`, `## Main Activity`, `## Plenary`) as distinct section cards.
  - Composer action button is inline (bottom-right): send by default, stop during active generation.
  - Composer auto-resizes from one line up to a capped max height.
- Chat hotkeys:
  - `Enter` sends.
  - `Shift+Enter` newline.
- Provider/model/class selectors are rendered below the composer (not in a global header) with localStorage-backed provider/model persistence.
- Context indicator showing which workspace files were used for the latest response.
- Context indicator separates workspace context from memory context.
- Memory-capture card allows confirm/edit/dismiss decisions and bulk actions after each loop.
- Frontend component-isolation workflow is available at `/playground` using the raw Tailwind `components/ui` primitives.

### API Layer

- `api/auth.ts`
- `api/sessions.ts`
- `api/chat.ts` (includes SSE parser for stream mode)
- `api/workspace.ts`
- `api/memory.ts`

## Testing Strategy

### Backend

- Bun tests cover auth, chat, sessions, workspace CRUD, prompt assembly/class extraction, provider switching, access control, stream mode, key-missing errors, plus explicit Sprint 0 persistence/config checks (teachers CRUD, sessions CRUD, env loading).

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
  - active-skill highlighting in the sidebar `Skills` section and skill markdown rendering in the main pane.

## Key Engineering Decisions

- Keep mock mode explicit by model selection rather than silent fallback.
- Keep Sprint 3 tool execution transparent by returning and rendering the full message chain.
- Stream by default in UI for better response UX.
- Persist sessions in PostgreSQL for reliability and cross-process consistency.
- Maintain non-stream chat path for compatibility and simpler fallback behavior.
