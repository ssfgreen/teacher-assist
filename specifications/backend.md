# Backend Development Plan

Companion to `frontend.md`. Each sprint is designed so that frontend and backend ship together — every backend capability has a corresponding API surface the frontend consumes in the same sprint.

---

## Sprint 0 — Project Scaffolding

**Goal:** Monorepo structure, tooling, CI, database, and dev environment ready.

### Deliverables

- [x] Initialise monorepo with `packages/backend` and `packages/frontend` workspaces
- [x] Bun runtime with TypeScript configuration (`tsconfig.json` with strict mode)
- [x] PostgreSQL setup with Docker Compose for local dev
- [x] Database migrations infrastructure (numbered SQL files in `db/migrations/`)
- [x] Migration `001_teachers.sql`: `teachers` table (id, email, name, password_hash, created_at)
- [x] Migration `002_sessions.sql`: `sessions` table (id, teacher_id, plugin, command, agent_name, messages JSONB, tasks JSONB, created_at, updated_at)
- [x] Environment configuration (`.env` with `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AUTH_SECRET`)
- [ ] Shared types package or shared types file between frontend and backend
- [x] Linting (Biome or ESLint) and formatting config
- [x] Basic test harness with Bun's built-in test runner
- [x] `CLAUDE.md` at project root

### Tests

- [x] Database connection and migration runner works
- [ ] Teachers table CRUD operations
- [ ] Sessions table CRUD operations
- [ ] Environment variable loading

### API Surface (none yet — internal only)

---

## Sprint 1 — Authentication + Basic Chat

**Goal:** A teacher can log in, select a model provider (Anthropic or OpenAI), send a prompt, and receive a streamed or complete response. No workspace, no skills, no agents — just a thin passthrough to the model API.

### Deliverables

#### Auth

- [x] Simple auth middleware: session-based (cookie + server-side session) or JWT
- [x] `POST /api/auth/login` — email + password → token/session
- [x] `POST /api/auth/logout`
- [x] `GET /api/auth/me` — returns current teacher profile
- [x] Password hashing with `bcrypt` or `argon2`
- [x] Auth guard middleware for all `/api/*` routes except login

#### Model Adapter (`model.ts`)

- [x] Unified interface: `callModel(provider, model, messages, tools?, options?) → ModelResponse`
- [x] Anthropic adapter using `@anthropic-ai/sdk` — messages API, tool calling format
- [x] OpenAI adapter using `openai` SDK — chat completions API, function calling format
- [x] Response normalisation: both providers return `{ content, toolCalls, usage, stopReason }`
- [x] Token counting and cost estimation per call
- [x] Provider/model validation (reject unknown providers)

#### Chat API

- [x] `POST /api/chat` — accepts `{ messages, provider, model }`, returns model response
- [x] Messages follow a unified format: `{ role: 'user' | 'assistant' | 'system', content: string }`
- [x] Streams response via Server-Sent Events (SSE) OR returns complete response (start with complete, add SSE in a later sprint if needed)
- [x] Rate limiting per teacher (basic, in-memory)

#### Session Persistence (basic)

- [x] `POST /api/sessions` — create a new session
- [x] `GET /api/sessions` — list sessions for current teacher (paginated, newest first)
- [x] `GET /api/sessions/:id` — get session with messages
- [x] `PUT /api/sessions/:id` — append messages to session
- [x] `DELETE /api/sessions/:id`
- [x] Sessions store: provider, model, messages array, timestamps
- [x] On every chat exchange, persist messages to the session

### Tests

- [x] **Unit:** Model adapter format translation (Anthropic ↔ internal, OpenAI ↔ internal), token counting, cost calculation
- [x] **Unit:** Auth middleware rejects unauthenticated requests, accepts valid tokens
- [x] **Unit:** Session CRUD operations
- [x] **Integration:** Full login → create session → send message → receive response → session persisted flow (mock model responses)
- [x] **Integration:** Provider switching (same session, different provider — should work)

#### Sprint 1 Additions Implemented

- [x] Real streaming mode over SSE for `/api/chat` (`stream: true`) with `delta`/`done`/`error` events.
- [x] True OpenAI streaming integration.
- [x] True Anthropic streaming integration.
- [x] Explicit mock-model behavior (`mock-*`) rather than silent fallback for real models.
- [x] Real-model missing API key returns explicit configuration error.
- [x] Session persistence to disk (`packages/backend/.data/store.json`) across backend restarts.
- [x] SSE robustness hardening (heartbeat and safe controller-close handling).
- [x] Optional `maxTokens` request support for `/api/chat` (non-stream and stream paths).
- [x] Provider smoke test command `bun run smoke:providers` with JSON log output.

#### Additional Critical Path Tests Implemented

- [x] Logout revokes auth for subsequent protected calls.
- [x] Chat without `sessionId` auto-creates a session.
- [x] Cross-user session access is denied.
- [x] Stream mode emits expected SSE events.
- [x] Real model without key returns `400`.

### API Summary

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/chat
POST   /api/sessions
GET    /api/sessions
GET    /api/sessions/:id
PUT    /api/sessions/:id
DELETE /api/sessions/:id
```

---

## Sprint 2 — Workspace + Context Injection

**Goal:** Teachers have a persistent workspace of markdown files. When they chat, relevant workspace context is injected into the system prompt. The system prompt is assembled from workspace content in the correct order.

### Status (Implemented 2026-02-27)

- [x] Workspace storage in PostgreSQL (`workspace_files`) keyed per teacher
- [x] Non-destructive workspace seeding with defaults (`soul.md`, `teacher.md`, `pedagogy.md`, `curriculum/`, `classes/`)
- [x] Workspace CRUD API (`GET/PUT/DELETE /api/workspace/*path`, `GET /api/workspace`, `POST /api/workspace/seed`)
- [x] Workspace rename API (`POST /api/workspace/rename`) for file/folder path moves
- [x] `soul.md` delete protection
- [x] Class reference extraction from user messages (`3B` pattern) and optional `classRef` request override
- [x] System prompt assembly using XML-tagged sections in defined order
- [x] Prompt token estimation and runtime logging
- [x] `/api/chat` response metadata includes `workspaceContextLoaded`
- [x] Unit + integration coverage for workspace and prompt ordering
- [x] Workspace CRUD and seeding operate against PostgreSQL storage
- [x] Backend startup validates workspace storage readiness (PostgreSQL + `workspace_files` table)

### Deliverables

#### Workspace Storage & API

- Workspace files stored in PostgreSQL under `workspace_files` (`teacher_id`, `path`, `content`)
- Seed workspace templates on first login: `soul.md`, `teacher.md`, `pedagogy.md`, `curriculum/` (empty stubs), `classes/` (empty stubs)
- Class profiles are stored as `classes/{classRef}/CLASS.md` (e.g. `classes/3B/CLASS.md`)
- `GET /api/workspace` — list workspace file tree for current teacher
- `GET /api/workspace/*path` — read file content
- `PUT /api/workspace/*path` — create or update file content
- `DELETE /api/workspace/*path` — delete file (with safeguards: cannot delete `soul.md`)
- `POST /api/workspace/rename` — rename/move a file or folder subtree (`{ fromPath, toPath }`)
- `POST /api/workspace/seed` — re-seed defaults (non-destructive, only creates missing files)

#### Workspace Loader (`workspace.ts`)

- Given an agent definition's `workspace` array, resolve and load referenced files
- Always load `soul.md` unconditionally (position 1 in prompt assembly)
- Load teacher profile and pedagogy preferences based on agent config
- Load class profile when a class is referenced in the user message (basic regex/keyword matching for now; feedforward hook will improve this later)
- Load relevant curriculum files when class + subject are identified

#### System Prompt Assembly (`prompt.ts`)

- Assemble system prompt in the defined order:
  1. Assistant identity (`soul.md`)
  2. Agent instructions (hardcoded planner instructions for now — no plugin system yet)
  3. Workspace context (teacher profile, pedagogy preferences)
  4. (Position 4–5 reserved for memory — Sprint 7)
  5. (Skill manifest — Sprint 3)
  6. (Command framing — Sprint 4)
- Each section wrapped in XML tags: `<assistant-identity>`, `<agent-instructions>`, `<workspace-context>`, etc.
- Token budget tracking: log total system prompt tokens per call

#### Updated Chat API

- `POST /api/chat` now assembles system prompt from workspace before calling model
- Request body extended: `{ messages, provider, model, sessionId?, classRef? }`
- If `classRef` provided (e.g. "3B"), load that class profile and relevant curriculum
- Response includes metadata: `{ response, usage, workspaceContextLoaded: string[] }`

### Tests

- **Unit:** Workspace file CRUD operations
- **Unit:** `soul.md` always loaded; missing `soul.md` handled gracefully (use default)
- **Unit:** System prompt assembly ordering — verify XML tags and section positions
- **Unit:** Class reference extraction from user message ("create a lesson for 3B" → classRef: "3B")
- **Unit:** Token counting for assembled system prompt
- **Integration:** Create workspace files → send chat with class reference → verify class profile appears in system prompt → model receives correct context
- **Integration:** Edit `soul.md` → send chat → verify assistant identity reflects changes
- **Integration:** Workspace seed creates expected file structure

### API Summary (additions)

```
GET    /api/workspace
GET    /api/workspace/*path
PUT    /api/workspace/*path
DELETE /api/workspace/*path
POST   /api/workspace/rename
POST   /api/workspace/seed
```

Updated: `POST /api/chat` now accepts `sessionId` and `classRef`

---

## Sprint 3 — Skills + Agentic Tool Loop

**Goal:** The planner agent has access to tools and skills. The core agent loop (`runAgentLoop`) executes tool-use cycles until the model stops calling tools or a safety limit is reached. Skills are loaded progressively across three tiers.

### Deliverables

#### Tool Registry (`tools/registry.ts`)

- Tool registration: name, description, JSON Schema for parameters, handler function
- Tool dispatch: given a tool call from the model, find and execute the correct handler
- Schema generation: produce tool definitions in Anthropic format and OpenAI format
- Error handling: tool execution errors returned as tool result messages (not thrown)

#### Built-in Tools (Phase 1 set)

- `read_file` — returns file content with line numbers
- `write_file` — creates or overwrites file in workspace or output directory
- `str_replace` — replaces exact string match in file; fails if not found or ambiguous
- `list_directory` — returns directory listing
- `read_skill` — loads skill content by tier (see below)
- `update_tasks` — manages a task list in the session (add, complete, update)

#### Skills Infrastructure (`tools/skills.ts`)

- Skills directory structure: `plugins/lesson-planning/skills/{skill-name}/SKILL.md` + reference files
- Tier 1 (manifest): Parse all `SKILL.md` frontmatter `description` fields → produce manifest string for system prompt (~100 tokens per skill)
- Tier 2 (SKILL.md): `read_skill("backward-design")` → returns full SKILL.md content (500–1500 tokens)
- Tier 3 (reference files): `read_skill("backward-design/examples.md")` → returns reference file content
- Skill discovery: scan plugin skill directories, build manifest at startup
- For MVP, seed with 2–3 skills: use open-source examples or stubs (e.g. a "backward-design" skill with a real SKILL.md and a simple reference file). Full pedagogical skills authored in a later sprint.

#### Agent Loop (`agent.ts`)

- `runAgentLoop({ agent, messages, tools, systemPrompt, options }) → AgentResult`
- Loop logic:
  1. Check safety limits (`maxTurns`, `maxBudgetUsd`)
  2. Call model with system prompt, messages, tool definitions
  3. If no tool calls: return result with status `success`
  4. If tool calls: execute each, append results to messages, continue loop
- Status codes: `success`, `error_max_turns`, `error_max_budget`
- `maxTurns` default: 25
- The agent loop replaces the simple `POST /api/chat` passthrough — chat now goes through the loop

#### Updated System Prompt Assembly

- Position 6: Skill manifest (Tier 1 descriptions of all available skills)
- Agent instructions now include: "You have access to the following tools..." with tool descriptions

#### Updated Chat API

- `POST /api/chat` now routes through `runAgentLoop`
- Response includes: all messages (including tool calls and results), usage totals, skills loaded (by tier)
- Frontend receives the full message chain so it can render tool use transparently

### Tests

- **Unit:** Tool registration, dispatch, schema generation (both provider formats)
- **Unit:** Skill manifest generation from directory scan
- **Unit:** `read_skill` returns correct tier content; errors on missing skill
- **Unit:** `update_tasks` add/complete/update operations
- **Unit:** Safety limits (maxTurns triggers `error_max_turns`, maxBudget triggers `error_max_budget`)
- **Integration:** Agent loop with mock model: model calls `read_skill` → gets Tier 2 → calls `read_skill` for Tier 3 → produces final response. Verify full message chain.
- **Integration:** Agent loop with mock model: model calls `write_file` → file created → model references it in response
- **Integration:** Tool execution error → returned to model as error message → model recovers
- **Integration:** System prompt includes skill manifest at correct position

### API Summary (changes)

`POST /api/chat` now returns richer response with full message chain and tool usage metadata.

---

## Sprint 4 — Commands + Hooks

**Goal:** Commands provide named entry points for tasks (`create-lesson`, `refine-lesson`). Hooks fire at defined lifecycle points (preLoop, postLoop, preModel, postModel, preTool, postTool). The feedforward, reflection, adjudication, and guardrail hooks are implemented.

### Deliverables

#### Plugin Discovery (`plugins.ts`)

- Scan `plugins/` directory for plugin structure (agents, commands, skills, hooks)
- Parse command markdown frontmatter (agent, description, mode, writes)
- Parse agent markdown frontmatter (model, provider, workspace, skills, tools, hooks, maxTurns, maxBudgetUsd)
- Build plugin registry at startup: commands → agents → skills → hooks mapping
- For MVP: hardcode to `lesson-planning` plugin, but use the discovery infrastructure

#### Command Routing

- `POST /api/chat` extended: `{ messages, provider?, model?, sessionId?, command? }`
- When `command` specified (e.g. `"create-lesson"`):
  - Look up command definition
  - Load command-specific framing (command markdown body) into system prompt at position 7
  - Route to the command's specified agent
  - Apply agent's model/provider if not overridden
- `GET /api/commands` — list available commands with descriptions
- Commands-available list added to system prompt at position 8

#### Hook Infrastructure (`hooks.ts`)

- Hook type definitions for each lifecycle point: `preLoop`, `postLoop`, `preModel`, `postModel`, `preTool`, `postTool`
- Hook resolution: agent definition lists hook names → resolve to implementations in plugin's `hooks/` directory
- Hook execution: run hooks in order, passing context (messages, tool calls, agent state)
- Hook abort: any hook can throw `HookAbortError(name, reason)` → terminates agent loop with status `error_hook_abort`
- All hook executions logged (for traces in Sprint 6)

#### Implemented Hooks

**`scope-check` (preLoop):** Validates the request is within lesson-planning domain. Simple keyword/intent check. Aborts with explanation if off-topic.

**`feedforward` (preLoop):** Identifies relevant workspace context (class profile, teacher preferences, curriculum). Composes summary. Returns it to the frontend for confirmation before generation proceeds. This is an interactive hook — it pauses the loop and waits for teacher response.

- API: `POST /api/chat` can return `{ status: 'awaiting_feedforward', feedforward: { summary, contexts } }` instead of a model response
- Frontend confirms/modifies/dismisses → sends `POST /api/chat/feedforward-response` → loop continues

**`age-appropriate` (postLoop):** Validates output is appropriate for the year group in the class profile. Simple heuristic checks + optional model-as-judge call (Haiku for cost).

**`curriculum-evidence` (postLoop):** Validates curriculum alignment claims include evidence pointers. Checks referenced files exist in workspace, line ranges valid, quoted text matches. Aborts if fabricated outcomes detected.

**`reflection-prompt` (postLoop):** Generates reflection questions based on workspace context and command. Returns to frontend for display before adjudication.

- API: response includes `{ reflectionPrompts: string[] }` in the postLoop phase

**`teacher-adjudication` (postLoop):** Presents Accept/Revise/Generate Alternatives per section. Interactive — pauses for teacher decision.

- API: `POST /api/chat` returns `{ status: 'awaiting_adjudication', sections: [...] }`
- Frontend sends decisions → `POST /api/chat/adjudication-response`
- "Revise" re-enters the agent loop with revision instructions
- "Generate Alternatives" re-enters with alternative generation instructions

#### Updated Agent Loop

- Hooks integrated at all lifecycle points
- preLoop hooks run before first model call (feedforward, scope-check)
- postLoop hooks run after final model response (age-appropriate, curriculum-evidence, reflection-prompt, teacher-adjudication)
- preModel/postModel hooks run around each model call
- preTool/postTool hooks run around each tool execution
- Hook abort terminates loop cleanly

#### Updated System Prompt Assembly

- Position 7: Command-specific framing (if command invoked)
- Position 8: Commands-available list

### Tests

- **Unit:** Plugin discovery parses frontmatter correctly
- **Unit:** Command routing resolves agent and framing
- **Unit:** Hook resolution merges agent hooks and caller hooks in order
- **Unit:** `HookAbortError` terminates loop with correct status
- **Unit:** Curriculum evidence checker: valid refs pass, invalid refs fail, fabricated outcomes caught
- **Unit:** Scope check: lesson planning passes, "write me a poem" fails
- **Integration:** Full flow with feedforward: send chat → get feedforward response → confirm → get model response
- **Integration:** Full flow with adjudication: model responds → reflection prompts shown → adjudication gate → teacher accepts → final response
- **Integration:** Adjudication "Revise" → re-enters loop → revised output
- **Integration:** Hook abort → loop terminates → correct status returned → session saved
- **Integration:** Command routing → correct agent instructions + command framing in system prompt

### API Summary (additions)

```
GET    /api/commands
POST   /api/chat/feedforward-response
POST   /api/chat/adjudication-response
```

Updated: `POST /api/chat` accepts `command`, returns interactive states (`awaiting_feedforward`, `awaiting_adjudication`, `awaiting_reflection`)

---

## Sprint 5 — Traces + Full Pedagogical Skills

**Goal:** Every agent loop invocation produces a structured trace. All pedagogical skills are authored and tested. Research data infrastructure is in place.

### Deliverables

#### Trace Infrastructure (`traces.ts`)

- Migration `003_traces.sql`: traces table (id, session_id, teacher_id, agent_name, command, status, started_at, completed_at, total_tokens, total_cost, spans JSONB)
- Trace creation: every `runAgentLoop` call creates a trace
- Span types:
  - `model_call` — provider, model, input/output tokens, cost, stop_reason
  - `tool_call` — tool name, arguments (redacted if sensitive), result summary, duration
  - `hook_execution` — hook name, lifecycle point, pass/abort, duration
  - `skill_load` — skill name, tier, token count
  - `feedforward` — summary shown, teacher response (confirmed/modified/dismissed)
  - `reflection` — prompts shown, teacher responses
  - `adjudication` — section, decision (accept/revise/alternatives), revision text, timestamp
  - `curriculum_check` — references checked, match results
- Session ID correlation: every trace references its session
- `GET /api/traces` — list traces for current teacher (paginated)
- `GET /api/traces/:id` — get full trace with spans
- `GET /api/sessions/:id/traces` — traces for a specific session

#### Full Pedagogical Skills

Author all skills specified in the product spec:

- `backward-design/` — SKILL.md + framework.md + examples.md
- `differentiation/` — SKILL.md + sen-strategies.md + eal-strategies.md + mixed-ability.md
- `lesson-structure/` — SKILL.md + timings-guide.md
- `retrieval-practice/` — SKILL.md + techniques.md
- `cognitive-load/` — SKILL.md + worked-examples.md
- `formative-assessment/` — SKILL.md + techniques.md
- `metacognition/` — SKILL.md + strategies.md
- `designing-for-equity/` — SKILL.md + accessibility-privacy.md

Each skill's SKILL.md includes: description (for manifest), overview, when to use, key concepts, pointers to Tier 3 files.

#### Curriculum Content

- Populate curriculum files for: Computing Science, Maths, English, French, History
- CfE Es & Os structured with outcome IDs (e.g. `TCH 3-13a`)
- Course specification documents converted to markdown
- Progression relationships encoded where applicable

#### Planner Agent Definition

- `plugins/lesson-planning/agents/planner.md` — full agent definition with frontmatter and instruction body
- References all skills, workspace files, tools, and hooks
- Instructions encode the "draft not decide" stance, skill consultation patterns, artefact bundle structure

### Tests

- **Unit:** Trace creation with all span types
- **Unit:** Trace query by session, by teacher, pagination
- **Unit:** Each skill's SKILL.md parses valid frontmatter with description
- **Unit:** Curriculum files contain valid outcome IDs that the evidence checker can verify
- **Integration:** Full agent loop → trace produced → all spans present → session ID linked
- **Integration:** Skill loading traced: Tier 2 load → span recorded, Tier 3 load → span recorded
- **Integration:** Hook executions traced: feedforward, adjudication, curriculum-evidence all produce spans
- **Agent eval:** Planner agent with full skills produces structured lesson plan for a Computing Science topic. Structural criteria: all required sections present, curriculum references valid, differentiation addressed for ASN-flagged class.

### API Summary (additions)

```
GET    /api/traces
GET    /api/traces/:id
GET    /api/sessions/:id/traces
```

---

## Sprint 6 — Memory + Session Search

**Goal:** The system accumulates knowledge from working with teachers. Teacher memory and class memory persist across sessions. Past sessions are searchable. The memory-capture hook proposes session-end updates for teacher confirmation.

### Deliverables

#### Memory Storage

- Migration `004_memory.sql`: `memory_files` and `memory_events` tables (as specified in dev spec)
- Memory file CRUD: create, read, update scoped by teacher_id and optionally class_id
- Virtual path system: `memory/MEMORY.md`, `memory/classes/3B/MEMORY.md`, etc.
- Teacher-id isolation: teachers can only access their own memory
- MEMORY.md discipline: only first 200 lines loaded into system prompt

#### Memory Tools (`tools/memory.ts`)

- `read_memory(path)` — loads memory file by virtual path. Returns content or error if not found.
- `update_memory(path, content, mode)` — appends to or replaces memory file content. Mode: `append` or `replace`. All writes produce `memory_events` entries.
- Scope inference: paths starting with `classes/` are class-scoped; others are teacher-scoped

#### Memory in System Prompt Assembly

- Position 4: Teacher memory — first 200 lines of `memory/MEMORY.md`
- Position 5: Class memory — `memory/classes/{classRef}/MEMORY.md` when class identified

#### Memory-Capture Hook (`memory-capture.ts`)

- postLoop hook, runs after adjudication
- Reviews session: what was revised, what patterns emerged, what workspace context was used
- Proposes memory updates as structured list with scope (teacher or class)
- API: returns `{ status: 'awaiting_memory_capture', proposals: [{ text, scope, classId? }] }`
- Teacher confirms/edits/dismisses each item → `POST /api/chat/memory-response`
- Confirmed items written via `update_memory`
- All decisions logged as `memory_events` and trace spans

#### Feedforward Hook Update

- Now loads class memory alongside workspace context
- Summary includes both static workspace and learned memory: "From previous sessions: shorter starters work better for 3B..."

#### Session Search Tools (`tools/sessions.ts`)

- Migration `005_session_search.sql`: add `search_vector` tsvector column, GIN index, class_id + date indexes
- `search_sessions(query, classId?, dateRange?)` — full-text search over past session messages. Returns summaries with session IDs.
- `read_session(sessionId)` — loads a specific past session's messages and metadata

#### Memory API (for workspace sidebar)

- `GET /api/memory` — list memory files for current teacher (tree structure)
- `GET /api/memory/*path` — read memory file content
- `PUT /api/memory/*path` — update memory file content (manual edit via sidebar)
- `DELETE /api/memory/*path` — delete memory file
- `POST /api/chat/memory-response` — teacher decisions on memory-capture proposals

### Tests

- **Unit:** Memory file CRUD with scope isolation
- **Unit:** Memory file teacher-id isolation (teacher A cannot read teacher B's memory)
- **Unit:** MEMORY.md 200-line truncation in prompt assembly
- **Unit:** `read_memory` and `update_memory` tool handlers
- **Unit:** `search_sessions` with keyword, class filter, date range
- **Unit:** `read_session` returns correct messages
- **Unit:** Memory events logged for all read/write operations
- **Integration:** Memory write flow: agent calls `update_memory` → file created/updated → event logged → trace span recorded
- **Integration:** Memory-capture hook: session completes → proposals generated → teacher confirms → memory written → events logged
- **Integration:** Memory in prompt: create memory for class 3B → start new session referencing 3B → verify class memory in system prompt
- **Integration:** Feedforward with memory: memory exists for class → feedforward surfaces it → teacher confirms → generation uses it
- **Integration:** Session search: create sessions with known content → search finds them → `read_session` loads correct one
- **Integration:** `--no-memory` flag disables memory loading and memory tools

### API Summary (additions)

```
GET    /api/memory
GET    /api/memory/*path
PUT    /api/memory/*path
DELETE /api/memory/*path
POST   /api/chat/memory-response
```

---

## Sprint 7 — Subagents

**Goal:** The planner agent can spawn subagents to handle specific sub-tasks (e.g. worksheet creation, quiz generation). Subagents run in isolated context and return summaries.

### Deliverables

#### Subagent Infrastructure (`tools/subagent.ts`)

- `spawn_subagent` tool: agent specifies subagent name, task description, and optional context
- Subagent resolution: look up agent definition by name in plugin's `agents/` directory
- Isolated execution:
  - Fresh message history (no parent conversation)
  - Subagent receives: its own system prompt (with soul.md identity), the task description, and optional context from parent
  - Access to workspace and memory (same as parent)
  - Access to tools (as defined in subagent's agent definition)
  - Own `maxTurns` (default 10)
  - No access to parent's conversation history
- Depth cap: subagents cannot spawn further subagents (depth = 1)
- Subagents cannot perform handoffs
- Result: subagent's final response returned as a tool result to the parent agent
- The result includes a summary of decisions made and any files created

#### Subagent Hooks

- `onSubagentStart` — fires when subagent spawned. Logs to trace, budget allocation check.
- `onSubagentEnd` — fires when subagent completes. Result inspection, logging.

#### Phase 2 Agent Definitions

- `plugins/lesson-planning/agents/pedagogy-reviewer.md` — reviews lesson plans for pedagogical soundness
- `plugins/lesson-planning/agents/resource-creator.md` — creates worksheets, revision guides, quiz materials
- `plugins/lesson-planning/agents/differentiation-specialist.md` — reviews and enhances differentiation strategies

Each agent has its own skills, tools, and hooks configuration. All share `soul.md` identity.

#### Trace Integration

- Subagent invocations logged as child spans within parent trace
- Child span includes: subagent name, task, messages, tool calls, usage, duration
- Parent trace aggregates total cost including subagent costs

#### Updated Planner Agent

- Planner's tool set now includes `spawn_subagent`
- Planner instructions updated: when to delegate (worksheet creation, differentiation review) vs. handle directly
- Planner can review subagent output and revise before presenting to teacher

### Tests

- **Unit:** Subagent resolution from agent definitions
- **Unit:** Isolated context: subagent does not see parent messages
- **Unit:** Depth cap: subagent's `spawn_subagent` call rejected
- **Unit:** Budget accounting: subagent cost added to parent trace
- **Integration:** Planner spawns resource-creator → resource-creator produces worksheet → result returned to planner → planner incorporates into final output
- **Integration:** Subagent hooks fire correctly (onSubagentStart, onSubagentEnd)
- **Integration:** Subagent trace spans nested correctly in parent trace
- **Integration:** Subagent has access to workspace and memory
- **Agent eval:** Planner + resource-creator subagent produces higher quality artefact bundle than planner alone (comparative eval)

### API Summary

No new API endpoints. Subagent execution is transparent to the frontend — the chat response includes the full message chain showing subagent delegation.

The frontend should render subagent spans in the chat as collapsible sections showing delegation.

---

## Sprint 8 — Handoffs

**Goal:** Agents can transfer control to a peer agent with structured context injection. Conversation history is preserved. The new agent continues with different expertise.

### Deliverables

#### Handoff Infrastructure (`tools/handoff.ts`)

- `transfer_to_{agent_name}` tools: one tool per handoff target defined in the agent's frontmatter
- When invoked:
  1. Outgoing agent provides structured context: decisions made, constraints identified, reason for handoff, open questions
  2. `onHandoff` hooks fire (logging, policy checks, context validation)
  3. New agent's system prompt assembled (different instructions, skills, tools)
  4. Context block injected before the new agent's first response as a structured message
  5. Conversation history preserved — new agent sees all prior messages
  6. Tools resolved fresh for the new agent
- Unlimited chaining: A → B → C → A is valid
- The frontend must handle the agent switch gracefully (update UI to show current agent)

#### Handoff Context Block

- Structured format the receiving agent can parse:
  ```
  <handoff-context from="planner" reason="Deep differentiation work needed">
    <decisions>...</decisions>
    <constraints>...</constraints>
    <open-questions>...</open-questions>
  </handoff-context>
  ```
- Injected as a system-level or assistant-level message before the receiving agent responds

#### Updated Agent Definitions

- Planner agent's frontmatter includes `handoffs: [differentiation-specialist, pedagogy-reviewer]`
- Differentiation specialist can hand back to planner
- Each agent's handoff targets listed in frontmatter

#### Trace Integration

- Handoff spans recorded: from agent, to agent, context block, timestamp
- Post-handoff messages attributed to the new agent in traces
- Full conversation trace maintained across handoffs

#### API Updates

- `POST /api/chat` response includes `currentAgent` field so frontend knows which agent is active
- When a handoff occurs mid-response, the SSE stream (or response) includes a `handoff` event with the new agent name and reason

### Tests

- **Unit:** Transfer tool generation from agent frontmatter handoff targets
- **Unit:** Context block construction and injection
- **Unit:** Agent switch: new system prompt assembled, tools resolved, history preserved
- **Unit:** Chaining: A → B → A works without infinite loops (safety: max handoff count per session)
- **Integration:** Planner hands off to differentiation-specialist → specialist responds with differentiation expertise → hands back to planner
- **Integration:** onHandoff hooks fire at each transition
- **Integration:** Trace spans capture full handoff chain
- **Integration:** Frontend receives agent switch notification

### API Summary (changes)

`POST /api/chat` response now includes `currentAgent` and may include `handoff` events in streamed responses.

---

## Sprint 9+ — Additional Elements

### Sprint 9: Streaming

- SSE streaming for model responses (token by token)
- Streaming through the agent loop: model response streams → tool calls detected → tools execute → next model call streams
- Frontend receives incremental tokens for display
- Trace still captures complete response after stream finishes

### Sprint 10: Eval Framework

- `evals/` directory structure: helpers, cases, unit, integration, agent
- Eval runner: execute eval cases against real models, collect scores
- Structural evals: section presence, curriculum evidence, differentiation coverage
- Model-as-judge evals: quality scoring against teacher-developed rubric (using Haiku for cost)
- Comparison evals: with/without skills, with/without workspace, with/without memory
- Cost tracking per eval run
- Eval results stored for regression tracking

### Sprint 11: Multi-Provider Model Comparison

- Run identical eval cases across Anthropic and OpenAI models
- Normalised scoring and cost comparison
- Trace data enables like-for-like analysis
- UI for selecting model per session or per comparison study

### Sprint 12: Production Hardening

- Proper error handling and recovery throughout
- Request validation (Zod schemas for all API inputs)
- Database connection pooling
- Graceful shutdown
- Health check endpoint
- Logging infrastructure (structured JSON logs)
- CORS configuration for deployment
- Rate limiting per teacher (Redis-backed for production)

### Sprint 13: Research Study Support

- Participant onboarding flow (workspace template completion)
- Condition assignment (which experimental condition per session)
- Think-aloud recording integration hooks
- Data export: anonymised traces, sessions, memory events
- Automated redaction pipeline for transcripts
- Research dashboard: per-participant metrics, per-condition aggregates

### Sprint 14: Deployment & Auth Hardening

- Docker containerisation (backend + frontend + PostgreSQL)
- SSL/TLS configuration
- OAuth or institutional SSO (for Phase 3)
- Role-based access (teacher, researcher, admin)
- Backup and recovery procedures
- Monitoring and alerting

---

## Cross-Cutting Concerns

### Error Handling Strategy

- Tool errors → returned to model as tool result messages (model reasons about them)
- Hook aborts → terminate loop, return `error_hook_abort` with reason
- Model API errors → retry with exponential backoff (max 3 retries), then return error
- Database errors → log and return 500 with generic message
- Auth errors → 401/403 with clear message

### Testing Strategy (TDD)

- Write tests first for every new module
- Unit tests: fast, deterministic, run on every commit
- Integration tests: mock model, real tools against temp filesystem and test database
- Agent evals: real models, real costs, run deliberately (not on commit)
- Bun's built-in test runner for all layers

### Security Considerations

- No student PII in workspace or memory (enforced by documentation, checked in review)
- API keys stored in environment variables, never in code or database
- Teacher-id isolation on all data access (workspace, memory, sessions, traces)
- Input sanitisation on all API endpoints
- File path traversal prevention in workspace and memory file access
