# Critical Paths

This document defines the highest-risk user journeys and the automated tests that protect them.

## Purpose

- Identify the paths most likely to cause user-visible regressions.
- Keep test ownership explicit as architecture evolves.
- Make release verification fast and repeatable.

## Verification Commands

Run from repository root:

```bash
bun run lint
cd packages/frontend && bun run test
cd ../backend && bun test
```

## Frontend Critical Paths

### 1. Authentication and first chat roundtrip

- Why critical:
  - App is unusable if login fails.
  - Chat response loop is the core product interaction.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `handles login and streams chat response on Enter`
    - `shows auth and chat errors`

### 2. Model/provider selection affects requests

- Why critical:
  - Wrong provider/model breaks evaluation and cost/control expectations.
  - Controls now live below the composer, so layout refactors can accidentally break wiring.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `uses selected provider and model for chat requests`
    - `loads command options and sends selected command in chat request`

### 3. Class context propagation

- Why critical:
  - Class-specific planning depends on correct `classRef` propagation.
  - `classRef` control now shares the same row as provider/model under the composer.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `passes selected class reference to chat API`

### 4. Session resume and editor/chat mode transitions

- Why critical:
  - Teachers iterate across sessions and switch between editing/chat frequently.
- Tests:
  - `packages/frontend/src/app.sessions.test.tsx`
    - `resumes a session when selected`
    - `does not highlight session cards while editing a workspace file`
    - `opens chat when selecting a session while editor is open`
    - `restores persisted context and trace metadata when reopening a session`

### 5. Workspace editing and context transparency

- Why critical:
  - Workspace is a core context source; regressions silently degrade answer quality.
- Tests:
  - `packages/frontend/src/app.workspace.test.tsx`
    - `opens workspace file and shows context indicator metadata`
    - `creates a file inside the selected folder`
    - `creates a folder inside the selected folder`
    - `renames the selected workspace item inline`
    - `creates CLASS.md when adding a class folder`
    - `deletes selected workspace path without modal`
    - `shows reset confirmation modal and resets workspace on confirm`

### 6. Tool-use transparency and skill activation UI

- Why critical:
  - Sprint 3 requires teachers to see what tools the agent ran and which skills were loaded.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `renders tool call blocks and marks loaded skill as active`
    - `loads full skill file from the skills section`
    - `collapses and expands sidebar sections from their headers`
    - `renders assistant lesson sections as distinct blocks`

### 7. Memory UI and capture decisions

- Why critical:
  - Sprint 5 depends on teacher-approved memory persistence and editable memory files.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `handles login and streams chat response on Enter` (stream + state stability)
  - `packages/frontend/src/app.workspace.test.tsx`
    - `opens workspace file and shows context indicator metadata` (context rendering path; includes memory context split in UI)

### 8. Interactive hook cards and ask-user-question flow

- Why critical:
  - Sprint 6 requires explicit pause/resume UX for command and mid-loop clarification.
  - Regressions here break command completion and teacher-in-the-loop controls.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `shows feedforward card and submits confirm response`
    - `renders ask-user-question card and submits selected option`

### 9. Trace viewer workflow (Sprint 7)

- Why critical:
  - Research/debug visibility now depends on dedicated trace browsing, filtering, and expansion from historical sessions.
- Tests:
  - `packages/frontend/src/app.traces.test.tsx`
    - `opens session trace viewer from sessions list`
    - `filters and expands trace spans`

### 10. Subagent delegation transparency (Sprint 8)

- Why critical:
  - Delegation must remain visible and inspectable inline so teachers can follow planner orchestration decisions.
  - Expand/collapse detail behavior is required for readable but transparent delegation output.
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `renders delegation block for spawn_subagent tool events`
    - `supports expand/collapse within delegation details`

## Backend Critical Paths

### 1. Auth guard and session lifecycle

- Why critical:
  - Security boundary and baseline app access.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `requires auth for protected endpoints`
    - `supports login, me, and logout`

### 2. Chat persistence with and without explicit session id

- Why critical:
  - Conversation continuity is core app value.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `supports session CRUD and chat persistence`
    - `creates a session automatically when chat is sent without sessionId`

### 3. Session ownership and isolation

- Why critical:
  - Data leakage across teachers is unacceptable.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `prevents cross-user session access`

### 4. Streaming response contract

- Why critical:
  - Frontend chat UX depends on SSE event order/shape.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `streams chat deltas and done event for stream mode`

### 5. Provider config and provider switching

- Why critical:
  - Real-model misconfiguration should fail safely and clearly.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `returns 400 for real model when API key is missing`
    - `supports provider switching on a session`

### 6. Workspace CRUD and chat context loading

- Why critical:
  - Workspace quality determines grounded lesson outputs.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `supports workspace seed/read/write/delete and chat context metadata`
    - `resets workspace to defaults`
    - `includes class-loading guidance in the system prompt for class-targeted chat`
  - `packages/backend/tests/workspace.test.ts`
    - `seeds expected workspace defaults`
    - `supports file CRUD and protects soul.md deletion`
    - `loads soul fallback when soul.md is missing`
    - `loads class and curriculum catalogs first for class chats`
    - `extracts class reference from latest user message`

### 7. Class-targeted response grounding via tool loop

- Why critical:
  - Class-specific outputs should be grounded in class profiles when needed, while preserving model discretion over tool usage.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `includes class-loading guidance in the system prompt for class-targeted chat`

### 8. Prompt assembly ordering

- Why critical:
  - Incorrect prompt ordering can alter model behavior significantly.
- Tests:
  - `packages/backend/tests/prompt.test.ts`
    - `assembles sections in correct order with XML tags`

### 9. Model adapter behavior and guardrails

- Why critical:
  - Provider abstraction failures can break all chat requests.
- Tests:
  - `packages/backend/tests/model.test.ts`
    - `rejects invalid providers`
    - `returns normalized mock response for mock model`
    - `throws configuration error for real model without API key`

### 10. Skills manifest and agent loop tool chain

- Why critical:
  - Sprint 3 flow depends on discoverable skills and reliable multi-turn tool execution.
- Tests:
  - `packages/backend/tests/skills.test.ts`
    - `builds manifest from skills directory`
    - `reads tier 2 and tier 3 skill content`
  - `packages/backend/tests/tools.registry.test.ts`
    - `generates provider tool schemas`
    - `supports update_tasks add/update/complete`
  - `packages/backend/tests/agent.test.ts`
    - `executes read_skill tool chain and returns final assistant response`
    - `returns error_max_turns when tool loop does not finish in limit`
    - `returns error_max_budget when response budget is exceeded`
  - `packages/backend/tests/server.integration.test.ts`
    - `lists available skills for authenticated users`
    - `returns full tool-use message chain and loaded skills from chat`
    - `persists trace/context/skills metadata across session reload`
    - `handles write_file tool roundtrip via /api/chat`
    - `recovers from tool execution errors via /api/chat`

### 11. Loop resilience under repeated failures and stalls

- Why critical:
  - Agentic loops can burn turns/cost without progressing unless retries and stall detection are enforced.
- Tests:
  - `packages/backend/tests/agent.test.ts`
    - `returns error_tool_retry_exhausted when tool failures exceed retry cap`
    - `returns error_no_progress when loop repeats without meaningful state change`
    - `forces final best-effort response when forceFinalizeOnStall is enabled`

### 12. Recursive skill reference safety

- Why critical:
  - Skill composition improves reuse but can create circular/deep expansion failures.
- Tests:
  - `packages/backend/tests/skills.test.ts`
    - `expands nested skill references within max depth`
    - `fails safely on circular skill references`
    - `reports missing referenced skill files without crashing loop`

### 13. Memory prioritization and consolidation

- Why critical:
  - Long-term quality depends on retrieving the right memory and preserving teacher isolation.
- Tests:
  - `packages/backend/tests/memory.test.ts`
    - `isolates memory files by teacher`
    - `truncates loaded memory context to 200 lines`
    - `searches sessions by keyword and class filter`

### 14. Sprint 0 persistence/config integrity

- Why critical:
  - Baseline database semantics and env loading must remain reliable as architecture changes.
- Tests:
  - `packages/backend/tests/sprint0.persistence.test.ts`
    - `supports teachers table CRUD operations`
    - `supports sessions table CRUD operations`
    - `loads database url from environment variables with fallback`

### 15. Command discovery and interactive routing (Sprint 6)

- Why critical:
  - Command-driven UX is the Sprint 6 entrypoint and must remain discoverable/wired.

### 16. Trace API contract and span integrity (Sprint 7)

- Why critical:
  - Frontend trace viewer depends on stable DTO shape and accurate session correlation.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `lists traces and supports trace lookup endpoints`
  - `packages/backend/tests/skills.test.ts`
    - `builds manifest from skills directory`
  - Invalid command routing must fail fast to avoid silent prompt drift.
- Tests:
  - `packages/backend/tests/server.integration.test.ts`
    - `lists available commands for authenticated users`
    - `rejects unknown command values in chat requests`
    - `runs feedforward -> reflection -> adjudication flow for command chats`
    - `pauses on ask_user_question and resumes via question-response`
  - `packages/backend/tests/commands.test.ts`
    - `lists command definitions with stable ids`
    - `builds command instructions for known commands`
  - `packages/backend/tests/agent.test.ts`
    - `pauses on ask_user_question and returns question payload`
  - `packages/backend/tests/tools.registry.test.ts`
    - `generates provider tool schemas` (includes `ask_user_question` schema contract)

### 17. Subagent execution isolation and rollups (Sprint 8)

- Why critical:
  - Delegated runs must stay bounded and synchronous in v1, while preserving accurate usage/cost totals and trace observability.
- Tests:
  - `packages/backend/src/agent.subagent.test.ts`
    - `completes planner -> subagent -> planner chain and rolls up usage`
    - `enforces delegation depth cap`
    - `blocks subagent delegation in child execution contexts`
  - `packages/backend/src/modules/chat/trace-builder.subagent.test.ts`
    - `adds subagent child span metadata for spawn_subagent tool calls`

## Notes

- Keep this file updated whenever a critical path changes or tests are reorganized.
- If a new user flow affects login, chat, session ownership, workspace context, or streaming, add it here with a corresponding automated test.
