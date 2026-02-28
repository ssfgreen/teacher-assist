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
- Tests:
  - `packages/frontend/src/app.auth-chat.test.tsx`
    - `uses selected provider and model for chat requests`

### 3. Class context propagation

- Why critical:
  - Class-specific planning depends on correct `classRef` propagation.
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
    - `renders assistant lesson sections as distinct blocks`

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
  - Long-term quality depends on retrieving the right memory under token limits and promoting only high-signal learnings.
- Tests:
  - `packages/backend/tests/memory.test.ts`
    - `ranks memory candidates by relevance importance recency and access`
    - `applies token-budget memory selection while keeping high-priority constraints`
    - `consolidates short-term memory to long-term with session and trace provenance`

## Notes

- Keep this file updated whenever a critical path changes or tests are reorganized.
- If a new user flow affects login, chat, session ownership, workspace context, or streaming, add it here with a corresponding automated test.
