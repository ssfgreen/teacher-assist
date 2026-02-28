# Technical Development Specification

Companion to the [Product & Research Specification](./product-spec.md). This document covers architecture, behaviour, evaluation strategy, and implementation approach. It assumes familiarity with the product rationale and phasing described there.

The product spec is the ground truth. Where this document and the product spec conflict, the product spec wins.

---

## Architecture Overview

The runtime is a tool-use loop. The real value lives in markdown definitions and context files.

```
┌──────────────────────────────────────────────────────────┐
│  Web UI (React + Tailwind + TypeScript)                  │
│  Split-pane: workspace sidebar + chat + document view    │
│  "create a lesson on iteration for 3B"                   │
└────────────────────────┬─────────────────────────────────┘
                         │  HTTP/WebSocket
              ┌──────────▼──────────┐
              │   Backend Server    │
              │ (NestJS on Bun/TS)  │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │    preLoop hooks    │ ← input validation, guardrails,
              │                     │   feedforward (workspace + memory)
              └──────────┬──────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Agent Loop                                              │
│  while (tool_calls && turns < maxTurns) {                │
│    preModel hooks → call model → postModel hooks         │
│    for each tool call:                                   │
│      preTool hooks → execute → postTool hooks            │
│  }                                                       │
│                                                          │
│  Tools available to planner agent:                       │
│  ┌────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │ file_* │ │ read_skill   │ │ update_tasks │           │
│  └────────┘ └──────────────┘ └──────────────┘           │
│  ┌──────────────┐ ┌──────────────┐                       │
│  │ read_memory  │ │update_memory │                       │
│  └──────────────┘ └──────────────┘                       │
│  ┌─────────────────┐ ┌───────────────┐                   │
│  │ search_sessions │ │ read_session  │                   │
│  └─────────────────┘ └───────────────┘                   │
│                                                          │
│  Phase 2 additions:                                      │
│  ┌─────────────────┐ ┌───────────────────────────┐      │
│  │ spawn_subagent  │ │ transfer_to_<agent_name>  │      │
│  └─────────────────┘ └───────────────────────────┘      │
└──────────────────────────┬───────────────────────────────┘
                           │
                ┌──────────▼──────────┐
                │   postLoop hooks    │ ← output validation, guardrails,
                │                     │   reflection prompt, teacher
                │                     │   adjudication gate,
                │                     │   memory-capture
                └──────────┬──────────┘
                           │
               ┌───────────▼───────────┐
               │  Session + Trace      │
               │  (PostgreSQL)         │
               └───────────────────────┘
```

### Primitives

- **Workspace** — persistent educator context (teacher profile, class profiles, pedagogy preferences, curriculum references, assistant identity) stored as markdown files. Teacher profile, pedagogical preferences, and assistant identity (`soul.md`) are always loaded into the system prompt. Class profiles and curriculum references are inserted depending on the user prompt using tiered loading similar to skills.
- **Memory** — accumulated knowledge the system learns from working with the teacher, stored in PostgreSQL and exposed as virtual markdown files. Teacher memory (cross-cutting preferences) loads at session start. Class memory (per-class learnings) loads when a class is referenced. The agent can read and write memory during sessions; a postLoop hook proposes session-end memory updates for teacher confirmation.
- **Plugins** — domain-specific bundles of agents, skills, commands, and hooks.
- **Agents** — LLMs configured with instructions, tools, and access to workspace, memory, and skills. Agent identity and interaction style come from `workspace/soul.md`.
- **Skills** — pedagogical domain knowledge loaded progressively across three tiers, following the Claude Code / Anthropic Agent SDK pattern. Encodes domain knowledge so teachers don't need it in their prompts.
- **Commands** — named entry points that frame a task and route to the right agent.
- **Hooks** — lifecycle callbacks that run at defined points in the agent loop. Hooks can inspect, log, modify, or abort. Guardrails are hooks that validate content and abort on failure. The **feedforward** hook surfaces workspace and memory context back to the teacher before generation. The **reflection prompt** hook prompts teachers to evaluate outputs against their own criteria before adjudication. The **teacher adjudication gate** presents decision controls and logs responses. The **memory-capture** hook proposes session-end memory updates for teacher confirmation.
- **Sessions** — persistent conversation history across invocations. Teachers can resume where they left off, supporting the observed workflow pattern of planning in fragments across the week. Past sessions are searchable by the agent via `search_sessions` and `read_session` tools.
- **Traces** — structured execution logs for research analysis and debugging, with session ID for cross-session correlation. Must support the full research metrics schema from product spec. Stored in PostgreSQL.
- **Subagents** — agents spawned in isolated context, returning summaries to parent (Phase 2).
- **Handoffs** — agents transferring control to a peer agent with structured context injection (Phase 2).

---

## Design Heritage

The architecture is intentionally aligned with Claude Code and the Anthropic Agent SDK so that the same skill files, workspace content, and conventions work in both the custom agent loop and directly with Claude Code during development and iteration.


| Concept                | Claude Code                      | Anthropic Agent SDK        | OpenAI Agents SDK  | teacher-assist                                   |
| ------------------------ | ---------------------------------- | ---------------------------- | -------------------- | -------------------------------------------------- |
| Core loop              | Agentic tool-use loop            | `query()` async generator  | `Runner.run()`     | `runAgentLoop()`                                 |
| Multi-agent (isolated) | Subagents                        | `Task` tool                | Agents as tools    | `spawn_subagent` (Phase 2)                       |
| Multi-agent (shared)   | —                               | —                         | Handoffs           | `transfer_to_*` with context injection (Phase 2) |
| Context                | CLAUDE.md                        | System prompt              | Instructions       | CLAUDE.md + workspace/ (incl. soul.md)           |
| Memory                 | Auto memory (`~/.claude/projects/<project>/memory/`) | —              | —                 | PostgreSQL memory (teacher + class scopes)        |
| Skills                 | Skills directories with SKILL.md | Progressive (3-tier)       | N/A                | Progressive (3-tier)                             |
| Validation             | —                               | Hooks (PreToolUse)         | Guardrails         | Hooks (some implement guardrails)                |
| Persistence            | JSONL transcripts                | `resume` by session ID     | Sessions           | Sessions (PostgreSQL)                            |
| Observability          | —                               | `SDKResultMessage`         | Tracing with spans | Traces with spans + sessionId                    |
| Safety limits          | —                               | `maxTurns`, `maxBudgetUsd` | `max_turns`        | `maxTurns`, `maxBudgetUsd`                       |
| Structured output      | —                               | `outputFormat`             | `output_type`      | `outputSchema`                                   |

### Claude Code Compatibility

A deliberate design goal is that the project's skill and workspace files are directly usable by Claude Code. This means:

- **CLAUDE.md** at the project root serves as the top-level context file
- **Skills follow the Claude Code directory convention:** each skill is a directory containing a `SKILL.md` file (Tier 2) and optional reference files (Tier 3)
- **Workspace files are plain markdown** that Claude Code can read via file tools
- **Memory follows the Claude Code auto-memory pattern:** a `MEMORY.md` entrypoint with topic files, first 200 lines loaded at session start, topic files loaded on demand. The key difference is storage in PostgreSQL rather than the filesystem, with virtual markdown file access via tools
- **During development**, a developer can use Claude Code to iterate on skills, workspace content, and agent prompts without running the custom agent loop
- **The custom agent loop adds** what Claude Code doesn't provide: hooks, sessions, traces, structured commands, plugin scoping, feedforward, reflection prompts, teacher adjudication gates, memory-capture, and the multi-agent patterns (Phase 2)

### OpenAI Provider Compatibility

File/skill/tool conventions remain Claude-compatible so skill definitions and workflows are reusable. The OpenAI provider adapter implements: tool calling format translation, structured output enforcement, cost and token accounting, and trace normalisation. This enables model comparison studies on identical eval cases without changing skill or workspace content.

---

## File Structure

```
teacher-assist/
├── CLAUDE.md                    # Project-level context (Claude Code compatible)
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── types.ts         # Core interfaces
│   │   │   ├── model.ts         # Model adapter (Anthropic, OpenAI)
│   │   │   ├── tools/
│   │   │   │   ├── registry.ts  # Tool registration, dispatch, schema generation
│   │   │   │   ├── files.ts     # read_file, write_file, str_replace, list_directory
│   │   │   │   ├── bash.ts      # Shell command execution (dev/eval only, not planner)
│   │   │   │   ├── skills.ts    # read_skill (progressive loading across 3 tiers)
│   │   │   │   ├── memory.ts    # read_memory, update_memory (teacher + class scopes)
│   │   │   │   ├── sessions.ts  # search_sessions, read_session (past session access)
│   │   │   │   ├── tasks.ts     # update_tasks (task tracking)
│   │   │   │   ├── subagent.ts  # spawn_subagent (Phase 2)
│   │   │   │   └── handoff.ts   # transfer_to_* with context injection (Phase 2)
│   │   │   ├── workspace.ts     # Workspace loading (incl. soul.md)
│   │   │   ├── plugins.ts       # Plugin/agent/command/skill/hook discovery + frontmatter
│   │   │   ├── prompt.ts        # System prompt assembly
│   │   │   ├── agent.ts         # runAgentLoop() — core loop
│   │   │   ├── hooks.ts         # Hook resolution, execution, abort error
│   │   │   ├── sessions.ts      # Session persistence
│   │   │   ├── traces.ts        # Trace logging
│   │   │   ├── server.ts        # HTTP/WebSocket API server
│   │   │   └── cli.ts           # CLI entry point (dev/eval use)
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api/             # Backend API client + WebSocket hooks
│       │   ├── components/
│       │   │   ├── workspace/   # Sidebar: file tree, editor (incl. soul.md + memory)
│       │   │   ├── chat/        # Chat window, message rendering
│       │   │   ├── adjudication/# Accept/Revise/Alternatives controls
│       │   │   ├── feedforward/ # Feedforward confirmation UI
│       │   │   ├── memory/      # Memory-capture confirmation UI
│       │   │   ├── sessions/    # Session list, resume
│       │   │   └── layout/      # Shell, split panes, responsive layout
│       │   ├── hooks/           # React hooks (useSession, useChat, useWorkspace, useMemory)
│       │   ├── stores/          # State management (Zustand or context)
│       │   └── types.ts         # Shared frontend types
│       ├── index.html
│       ├── tailwind.config.ts
│       ├── vite.config.ts
│       ├── package.json
│       └── tsconfig.json
├── plugins/
│   └── lesson-planning/
│       ├── agents/
│       │   ├── planner.md
│       │   ├── pedagogy-reviewer.md            # Phase 2
│       │   ├── resource-creator.md             # Phase 2
│       │   └── differentiation-specialist.md   # Phase 2
│       ├── commands/
│       │   ├── create-lesson.md
│       │   └── refine-lesson.md
│       ├── skills/
│       │   ├── backward-design/
│       │   │   ├── SKILL.md
│       │   │   ├── framework.md
│       │   │   └── examples.md
│       │   ├── differentiation/
│       │   │   ├── SKILL.md
│       │   │   ├── sen-strategies.md
│       │   │   ├── eal-strategies.md
│       │   │   └── mixed-ability.md
│       │   ├── lesson-structure/
│       │   │   ├── SKILL.md
│       │   │   └── timings-guide.md
│       │   ├── retrieval-practice/
│       │   │   ├── SKILL.md
│       │   │   └── techniques.md
│       │   ├── cognitive-load/
│       │   │   ├── SKILL.md
│       │   │   └── worked-examples.md
│       │   ├── formative-assessment/
│       │   │   ├── SKILL.md
│       │   │   └── techniques.md
│       │   ├── metacognition/
│       │   │   ├── SKILL.md
│       │   │   └── strategies.md
│       │   └── designing-for-equity/
│       │       ├── SKILL.md
│       │       └── accessibility-privacy.md
│       └── hooks/
│           ├── scope-check.ts
│           ├── age-appropriate.ts
│           ├── curriculum-evidence.ts
│           ├── feedforward.ts
│           ├── reflection-prompt.ts
│           ├── teacher-adjudication.ts
│           └── memory-capture.ts
├── workspace/
│   ├── soul.md              # Assistant identity — teacher-editable
│   ├── teacher.md
│   ├── pedagogy.md
│   ├── curriculum/
│   │   ├── cfe-computing.md
│   │   ├── cfe-technologies.md
│   │   ├── cfe-maths.md
│   │   ├── cfe-english.md
│   │   ├── cfe-french.md
│   │   └── cfe-history.md
│   └── classes/
│       ├── 1B.md
│       ├── 2A.md
│       ├── 2C.md
│       └── 3B.md
├── db/                          # PostgreSQL for sessions, traces, and memory
│   └── migrations/
│       ├── 001_sessions.sql
│       ├── 002_traces.sql
│       └── 003_memory.sql
├── evals/
│   ├── helpers/
│   ├── cases/
│   ├── unit/
│   ├── integration/
│   └── agent/
├── package.json                 # Monorepo root (workspaces)
├── tsconfig.json
└── .env
```

---

## Behavioural Specification

### Agent Loop

The agent loop is the core runtime. It takes an agent definition, optional command framing, user input, and available tools, then runs a model-tool cycle until the model responds without tool calls or a safety limit is reached.

`runAgentLoop` is backed by a first-class context maintainer that owns loop state and diagnostics, rather than using raw message arrays as the only state carrier.

#### Context object contract

- `history`: validated chat/tool message sequence used for model calls
- `toolCalls`: per-call lifecycle state (`pending | completed | failed`) with retry counts
- `taskProgress`: structured task-state snapshot for `update_tasks`
- `feedback`: hook outputs, loop warnings, and guardrail notes
- `contextSummary`: compact counters and progress markers for traces/debug payloads

**Behaviour:**

1. Resolve and merge hooks from the agent definition and any caller-provided hooks
2. Run **preLoop** hooks. This includes the **feedforward** hook (product spec §5): when a teacher prompts something like "Create a lesson for 3B", the system surfaces what context it already has from both workspace and memory — "I know 3B is a mixed-ability class with 2 EAL students and you prefer retrieval practice starters. From previous sessions: shorter starters (5 min) work better for this class and the EAL pair benefits from flowcharts before code. Should I proceed with all of this?" Any hook may throw a hook abort error to terminate immediately.
3. Assemble the system prompt from assistant identity, agent instructions, workspace context, teacher memory, class memory (if applicable), skill manifest, and command framing
4. Load session messages if resuming, append the new user input
5. Enter the loop:
   - Check safety limits (maxTurns, maxBudgetUsd). Return error status if exceeded
   - Check loop resilience limits (`maxToolRetries`, `maxNoProgressIterations`)
   - Run **preModel** hooks
   - Call the model with system prompt, messages, and tool definitions
   - Run **postModel** hooks
   - Record token usage and cost in the trace
   - Update context summary and progress markers
   - If no tool calls in response: run **postLoop** hooks (including **reflection prompt**, **teacher adjudication gate**, and **memory-capture**), persist session and trace, return result
   - If tool calls: for each call, run **preTool** hooks, execute the tool, run **postTool** hooks, append result to messages
   - If stalled/no-progress and `forceFinalizeOnStall=true`, request a final best-effort response and terminate safely
6. If a hook abort error is thrown at any point, write the trace and return with abort status and reason

**Error handling:** Tool execution errors are caught and returned as tool result messages so the model can reason about them. Hook abort errors are the only exception type that terminates the loop.

**Status codes:** `success`, `error_max_turns`, `error_max_budget`, `error_hook_abort`, `error_tool_retry_exhausted`, `error_no_progress`

### Hooks

Hooks are lifecycle callbacks that run at defined points in the agent loop. They are the single extension mechanism.

**Lifecycle points:**


| Hook            | When it runs                                       | Typical use                                                                    |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| preLoop         | Before first model call, after user input received | Input validation,**feedforward** (surfaces workspace + memory context for confirmation) |
| postLoop        | After final model response (no more tool calls)    | Output validation,**reflection prompt**, **teacher adjudication gate**, **memory-capture** |
| preModel        | Before each model call                             | Message inspection, token budget checks                                        |
| postModel       | After each model response                          | Response logging, content filtering                                            |
| preTool         | Before each tool execution                         | Tool call validation, permission checks                                        |
| postTool        | After each tool execution                          | Result logging, result modification                                            |
| onHandoff       | When an agent hands off to another (Phase 2)       | Logging, policy checks, context validation                                     |
| onSubagentStart | When a subagent is spawned (Phase 2)               | Logging, budget allocation                                                     |
| onSubagentEnd   | When a subagent completes (Phase 2)                | Result inspection, logging                                                     |

**Abort behaviour:** Any hook may throw a hook abort error with a name and reason. This immediately terminates the agent loop and returns an error result.

**Hook resolution:** An agent definition lists hook names. The runtime resolves these to backend hook implementations (`packages/backend/src/hooks/*`). Caller-provided hooks are merged and run after agent-defined hooks.

**Trace integration:** Every hook execution is recorded as a span in the trace.

### Feedforward Hook (Product Spec §5)

The feedforward hook is a preLoop hook that externalises the teacher's workspace context and accumulated memory before generation begins. When a teacher prompts "Create a lesson for 3B", the feedforward hook:

1. Identifies which workspace context is relevant (class profile, teacher preferences, curriculum)
2. Loads relevant class memory (via `read_memory`) for any referenced class
3. Composes a summary combining static workspace and learned memory: "I know 3B is a mixed-ability class with 2 EAL students (Ukrainian) and you prefer retrieval practice starters. From previous sessions: shorter starters (5 min) work better for this class, the EAL pair benefits from flowcharts before code, and they've now completed the iteration unit. I'll use CfE Third Level outcomes for Computing Science. Should I proceed with all of this?"
4. Sends this to the frontend for teacher confirmation/modification
5. Logs the teacher's response (confirmed / modified / dismissed) to the trace

This directly addresses the self-awareness metacognitive demand (product spec §2.1.1) and supports confidence calibration by making the system transparent (product spec §3.5). With accumulated memory, feedforward becomes more valuable over time as the system learns what works for specific classes.

### Reflection Prompt Hook (Product Spec §3.7)

The reflection prompt hook is a postLoop hook that runs before the adjudication gate. Rather than presenting outputs for passive acceptance or rejection, it prompts the teacher to evaluate outputs against their own criteria:

- "Does this align with the learning outcomes you specified for 3B?"
- "Does the differentiation address the EAL needs in the class profile?"
- "Is the level of challenge appropriate for the ability range?"

The specific reflection prompts are generated based on the workspace context and the command that was invoked. Teacher responses are logged to the trace for research analysis (metacognitive strategy coding, product spec §7.3 P2).

### Memory-Capture Hook (Product Spec §5)

The memory-capture hook is a postLoop hook that runs after the teacher adjudication gate. It reviews the completed session and proposes memory updates for teacher confirmation.

**Behaviour:**

1. Reviews the session: what workspace/memory context was used, what was revised during adjudication, what patterns emerged (e.g. teacher consistently adjusted timing, revised differentiation approach, changed register)
2. Proposes memory updates as a structured list, scoped to teacher or class level:
   - Teacher-level: "You revised the worksheet register to be more informal — should I remember you prefer informal register in worksheets?"
   - Class-level: "You shortened the starter from 10 to 5 minutes for 3B — should I remember shorter starters work better for this class?"
3. Sends proposals to the frontend for teacher confirmation/edit/dismissal per item
4. Confirmed items written to appropriate memory scope via `update_memory`
5. All decisions logged to trace (proposed text, scope, teacher decision, final text if edited)

**Research value:** Memory-capture engagement is a P2 metric (product spec §7.3). Confirmation vs. dismissal patterns reveal what teachers find worth remembering, and whether memory curation feels like useful reflection or unwanted friction.

### Guardrails (as Hooks)

Guardrails are hooks that validate content and abort on failure. Phase 1 provides:

**scope-check** (preLoop): Validates request is within the plugin's domain. Rejects non-planning tasks.

**age-appropriate** (postLoop): Validates output is appropriate for the year group in the workspace class profile.

**curriculum-evidence** (postLoop): Validates that any curriculum alignment claim includes verifiable evidence pointers. Checks referenced files exist in workspace, line ranges are valid, quoted text matches file content, and no invented outcomes appear. Directly addresses the curriculum hallucination risk identified in teacher interviews.

**teacher-adjudication** (postLoop): Presents Accept / Revise / Generate Alternatives controls per section or per artefact bundle. Logs decisions into trace spans with decision type, section, timestamp, and any revision request text. In CLI mode, text prompt; in web UI mode, interactive controls.

### Progressive Skill Loading (3-Tier)

Three tiers, matching the Claude Code and Anthropic Agent SDK architecture. Each tier increases token cost but provides richer context. The agent controls when to escalate.

**Tier 1 — Manifest (always in system prompt):** Skill names and one-line descriptions, ~100 tokens per skill.

**Tier 2 — SKILL.md (loaded on first relevance):** Overview, when to use it, key concepts, and pointers to Tier 3 files. 500–1500 tokens. Loaded via `read_skill <name>`.

**Tier 3 — Reference files (loaded on demand):** Full frameworks, worked examples, rubrics, strategy lists, curriculum mappings. Loaded via `read_skill <name>/<filename>`.

**Reference expansion and safety:**

- Skill content can reference additional skill files via inline tokens (e.g. `[skill:backward-design]`, `[skill:backward-design/examples.md]`)
- Recursive expansion uses a bounded depth (`maxReferenceDepth`, default 5)
- Circular references are detected and returned as safe tool errors
- Missing referenced files are reported in-context without crashing the loop

This implements product spec §3.3: domain knowledge lives in the system, not in the prompt.

### System Prompt Assembly

Composed from multiple sources in defined order:

1. **Assistant identity** — `workspace/soul.md`, defining interaction style, professional stance, and values. Teacher-editable.
2. **Agent instructions** — the agent's markdown body (technical capabilities and behaviour)
3. **Workspace context** — content of workspace files referenced by the agent definition (teacher profile, pedagogy preferences)
4. **Teacher memory** — first 200 lines of `MEMORY.md` from teacher-scope memory. Accumulated cross-cutting preferences and patterns.
5. **Class memory** — `MEMORY.md` for referenced class, if identified by feedforward or command parsing. Accumulated per-class learnings.
6. **Skill manifest** — names and descriptions of available skills (Tier 1 only)
7. **Command-specific framing** — the command's markdown body, if a command was invoked
8. **Commands-available** — names and descriptions of available commands
9. **Available subagents manifest** — names and descriptions (Phase 2)
10. **Handoff targets** — names and descriptions (Phase 2)
11. **Task list** — any pending tasks from the session

Each section wrapped in XML tags. Tier 2 and Tier 3 content is only added when the agent calls `read_skill`. Class memory beyond the MEMORY.md entrypoint is loaded via `read_memory`.

### Memory

Memory is accumulated knowledge the system learns from working with the teacher. It follows the Claude Code auto-memory pattern adapted for a multi-tenant PostgreSQL backend. Each authenticated teacher sees only their own memory.

#### Storage

Memory is stored in PostgreSQL with virtual markdown file access via tools. The schema supports two scopes:

- **Teacher memory**: Cross-cutting preferences and patterns. Keyed by teacher ID.
- **Class memory**: Per-class learnings. Keyed by teacher ID + class identifier.

Each scope has a `MEMORY.md` entrypoint and optional topic files, mirroring the Claude Code directory structure:

```
Teacher memory (virtual paths):
  memory/MEMORY.md              # Index — first 200 lines loaded at session start
  memory/planning-patterns.md   # "Prefers bullet-point plans, informal worksheet register"
  memory/style-preferences.md   # "Uses Scots dialect examples in Computing Science"

Class memory (virtual paths):
  memory/classes/3B/MEMORY.md   # "Shorter starters, visual scaffolds for EAL pair, completed iteration + functions"
  memory/classes/3B/lessons.md  # Log of planned lessons — avoids repetition
  memory/classes/2C/MEMORY.md   # Per-class learnings for 2C
```

#### Reading memory

- Teacher `MEMORY.md` (first 200 lines) → loaded into system prompt at position 4 (see System Prompt Assembly)
- Class `MEMORY.md` → loaded into system prompt at position 5 when class is identified by feedforward or command
- Topic files → loaded on demand via `read_memory <path>` tool (same pattern as `read_skill`)

#### Writing memory

Two mechanisms, both traced:

1. **Agent-driven** (during session): The agent can call `update_memory` to write working notes as it discovers patterns. Low ceremony — the agent writes contextual observations as they arise.
2. **Hook-driven** (post-session): The `memory-capture` postLoop hook does a structured review and proposes confirmed insights for teacher approval. This is the primary mechanism for persistent memory — teacher confirmation ensures quality.

Both mechanisms follow the same anonymisation principles as workspace: memory records "the EAL pair" or "the advanced group", never named students.

#### Memory management

Teachers can review and edit memory files via the workspace sidebar in the web UI. Memory files appear alongside workspace files but are visually distinguished. The `read_memory` and `update_memory` tools give the agent access during sessions.

**MEMORY.md discipline:** Following the Claude Code pattern, MEMORY.md acts as a concise index. The agent is instructed to keep it under 200 lines by moving detailed notes into topic files. Content beyond 200 lines in MEMORY.md is not loaded at startup.

**Consolidation policy (Nanobot-aligned):**

- Maintain short-term memory during a session and promote to long-term memory at session end
- Promotion uses scored thresholds across relevance, importance, recency, and reinforcement frequency
- Consolidation writes retain provenance (`session_id`, `trace_id`) for auditability and research analysis

**Retrieval policy:**

- Memory retrieval for prompt injection uses weighted ranking: relevance > importance > recency > access count
- Under token limits, highest-priority constraints are included first (e.g. safeguarding, class-specific needs)
- Selection decisions are logged in traces for transparency/evaluation

### Subagents (Phase 2)

Subagents are spawned via `spawn_subagent`. They run in isolated context — fresh message history, no access to the parent's conversation — and return a summary as a tool result.

**Constraints:** Cannot spawn further subagents (depth capped at 1). Cannot perform handoffs. Inherit workspace and memory access but not conversation history. Own maxTurns (default 10). Output includes summary of decisions and constraints encountered.

### Handoffs (Phase 2)

Handoffs transfer control from one agent to another. Conversation history is preserved — the new agent continues with the same messages but different system prompt and tool set.

**Handoff context injection:** The outgoing agent provides structured context (decisions, constraints, reason, open questions). The incoming agent receives this as a structured context block before its first response.

**Constraints:** Unlimited chaining (A → B → C → A). Tools resolved fresh for new agent. Context block required. onHandoff hooks run at each transition.

### Sessions

PostgreSQL sessions store: id, plugin, command, agent name, messages, tasks, adjudication decisions, feedforward responses, memory-capture decisions, timestamps. This supports the observed workflow pattern where planning happens in fragments across the week.

Sessions are searchable by the agent via `search_sessions` (keyword, class, date range → summaries with IDs) and `read_session` (load specific past session transcript). This enables continuity: when a teacher says "like what we did for 3B last week", the agent can find and reference the relevant past session.

### Traces

Every agent loop invocation produces a trace. Traces are the primary research data artefact, supporting all metrics in product spec.

**What traces capture:**

- **Session reference** — `sessionId` for cross-session correlation
- **Model calls** — token counts, cost estimates, stop reason
- **Tool calls** — arguments, results, skill tier loaded, memory files accessed/written
- **Hook executions** — pass/abort status
- **Feedforward engagement** — did teacher review? Modify? Dismiss? What memory context was surfaced?
- **Reflection prompt responses** — teacher's evaluation responses
- **Teacher adjudication decisions** — accept/revise/alternatives, section, timestamp, revision text
- **Memory-capture decisions** — proposed updates, scope (teacher/class), teacher decision (confirmed/edited/dismissed), final text
- **Memory reads/writes** — which memory files accessed, when, by agent or hook
- **Curriculum evidence checks** — referenced files, line ranges, match status
- **Confidence calibration data** — pre-evaluation confidence rating if collected
- **Session lookups** — search queries and retrieved session IDs
- **Subagent invocations** (Phase 2) — nested as child spans
- **Handoffs** (Phase 2) — from/to agent names, context block

### Model Abstraction

The model adapter handles format differences and normalises cost and token accounting for trace logging between Anthropic and OpenAI APIs.

### Tools

**Planner agent tools (Phase 1):**


| Tool            | Behaviour                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------- |
| read_file       | Returns file content with line numbers                                                     |
| write_file      | Creates or overwrites a file                                                               |
| str_replace     | Replaces exact string match. Fails if not found or ambiguous                               |
| list_directory  | Returns directory listing                                                                  |
| read_skill      | Loads skill content by reference (Tier 2 or Tier 3). Returns error if not found            |
| read_memory     | Loads memory file by virtual path (teacher or class scope). Returns error if not found     |
| update_memory   | Appends to or creates a memory file. Scoped to current teacher. All writes traced          |
| search_sessions | Searches past sessions by keyword, class, date range. Returns summaries with session IDs   |
| read_session    | Loads a specific past session transcript by ID. Returns messages and metadata               |
| update_tasks    | Adds, updates, or completes tasks in the session task list                                 |

**Note on bash:** Available for eval harness and developer use only. Not in planner agent's tool set.

**Phase 2 additions:** `spawn_subagent`, `transfer_to_*`

### Workspace Content

#### Assistant identity (`soul.md`)

A teacher-editable markdown file defining how the assistant interacts. Ships with sensible defaults:

```markdown
# Teaching Assistant Identity

You are a lesson planning assistant working with experienced professionals.
Your role is to draft, not to decide. The teacher is always the designer.

## Interaction principles
- Present all outputs as drafts for professional review, never finished products
- When uncertain about a pedagogical choice, name the uncertainty and offer alternatives
- Use the teacher's own terminology from their workspace profile
- If a request conflicts with stated pedagogy preferences, surface the tension
- Never claim curriculum alignment without evidence pointers
- Treat differentiation as a first-class concern, not an afterthought

## Professional boundaries
- You have pedagogical knowledge (via skills) but the teacher has classroom knowledge
- You can suggest, reason, and reference evidence — you cannot override professional judgment
- Match register and complexity in student-facing content to the class profile

## Communication style
- [Teacher can customise: concise vs. detailed, collaborative vs. directive, etc.]
```

Loaded at position 1 in system prompt assembly. Shared across all agents in the plugin — planner, reviewer, differentiator all share the same professional identity.

#### Curriculum files with progression relationships

Curriculum files encode outcomes, relationships, assessment expectations, and common misconceptions. Must support at minimum: Computing Science, Maths, English, French, and History.

For the Curriculum for Excellence, this will typically include:

- Course Specification Document (.pdf converted to .md) with original pdf available for reference.
- Past Papers and Marking Instructions (.pdfs converted to .md and tagged with specification codes for easy lookup)
- Any coursework, understanding standards documentation, course reports etc.

#### Class profiles (anonymised)

No names, no identifying details. Same level of abstraction a teacher would use discussing planning with a colleague (product spec §5).

### Markdown Formats

#### Agent definitions

Markdown with YAML frontmatter. Frontmatter configures; body provides system prompt instructions.


| Field        | Type     | Default    | Description                                   |
| -------------- | ---------- | ------------ | ----------------------------------------------- |
| model        | string   | required   | Model identifier                              |
| provider     | string   | required   | `anthropic` or `openai`                       |
| workspace    | string[] | `[]`       | Workspace file references                     |
| skills       | string[] | `[]`       | Skill directory names                         |
| tools        | string[] | `[]` (all) | Tool names (empty = all built-in except bash) |
| hooks        | string[] | `[]`       | Named hooks to run                            |
| memory       | boolean  | `true`     | Whether agent can read/write memory           |
| handoffs     | string[] | `[]`       | Agent names for handoff (Phase 2)             |
| outputSchema | object   | none       | JSON Schema for structured output             |
| maxTurns     | number   | 25         | Maximum loop iterations                       |
| maxBudgetUsd | number   | none       | Maximum API spend                             |

Note: `soul.md` is always loaded from workspace when present. It does not need to be listed in the `workspace` array — it is loaded unconditionally at position 1 in prompt assembly.

#### Command definitions

Markdown with YAML frontmatter. Body provides task-specific framing appended to system prompt.


| Field       | Type   | Default  | Description               |
| ------------- | -------- | ---------- | --------------------------- |
| agent       | string | required | Agent to invoke           |
| description | string | required | Shown in`--list`          |
| mode        | string | `single` | `single` or `interactive` |
| writes      | string | none     | Expected output path      |

#### Skills (3-tier directory structure)

Each skill is a directory containing SKILL.md (Tier 2) and optional reference files (Tier 3).

**SKILL.md frontmatter:**


| Field       | Type   | Description                          |
| ------------- | -------- | -------------------------------------- |
| description | string | One-line summary for Tier 1 manifest |

### Web UI

A React + Tailwind (perhaps using modified ShadCN) + TypeScript application providing a split-pane interface. For Phase 1 this supports researcher-mediated user studies. It replaces the CLI for study sessions to reduce friction and avoid confounding timing measurements.

**Core requirements:**

- **Workspace sidebar**: File tree + editor for workspace markdown files. Teachers can view and edit profiles, class descriptions, pedagogy preferences, curriculum references, and assistant identity (`soul.md`). Memory files appear in the sidebar alongside workspace files, visually distinguished (e.g. different icon or section header). Changes persist.
- **Chat window**: Conversational interface for dialogue with the LLM. Displays agent responses with section structure. Shows feedforward confirmations inline.
- **Feedforward UI**: When the feedforward hook fires, shows the surfaced context (workspace + memory) and allows the teacher to confirm, modify, or dismiss before generation proceeds.
- **Reflection prompts**: Before adjudication controls, displays reflection questions tied to the specific output and workspace context.
- **Adjudication controls**: Accept / Revise / Generate Alternatives per section or artefact. All decisions logged to traces.
- **Memory-capture UI**: After adjudication, displays proposed memory updates with confirm/edit/dismiss controls per item. Shows which scope (teacher or class) each proposal targets.
- **Session management**: Resume previous sessions. Session list view. Supports the "planning in fragments" workflow.
- **Document view**: Preview of generated artefacts (lesson plan, worksheet) in a readable format alongside the chat.

**Technical stack:** Vite + React + Tailwind CSS + TypeScript. Communicates with backend via HTTP/WebSocket. Zustand or React Context for state management. CodeMirror or Monaco for workspace editing.

**Phase 1 scope:** Local deployment (`localhost`), simple auth (researcher passcode or similar), single concurrent user. Not a production frontend.

### CLI

Remains available for developer use, eval execution, and trace inspection.

```
Usage:
  teacher-assist <plugin>:<command> "<input>"
  teacher-assist lesson-planning:create-lesson "recursion for 1B"

Options:
  --list                      List all plugins and commands
  --interactive               Start interactive REPL
  --resume <session-id>       Resume a previous session
  --sessions                  List recent sessions
  --sessions --plugin <n>     Filter sessions by plugin
  --trace <trace-id>          View a trace
  --provider <n>              Override provider
  --model <n>                 Override model
  --max-turns <n>             Override max turns
  --dry-run                   Show assembled prompt without calling model
  --serve                     Start web UI backend server
  --no-memory                 Disable memory for this session
```

---

## Database Schema

### Memory tables

```sql
-- memory_files: virtual markdown files for teacher and class memory
CREATE TABLE memory_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id),
    scope TEXT NOT NULL CHECK (scope IN ('teacher', 'class')),
    class_id TEXT,                          -- NULL for teacher-scope, class identifier for class-scope
    path TEXT NOT NULL,                     -- virtual path, e.g. 'MEMORY.md', 'planning-patterns.md', 'classes/3B/MEMORY.md'
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (teacher_id, scope, class_id, path)
);

-- memory_events: audit log of all memory reads and writes (for traces)
CREATE TABLE memory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id UUID REFERENCES traces(id),
    session_id UUID REFERENCES sessions(id),
    teacher_id UUID NOT NULL REFERENCES teachers(id),
    memory_file_id UUID REFERENCES memory_files(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('read', 'write', 'capture_proposed', 'capture_confirmed', 'capture_edited', 'capture_dismissed')),
    proposed_text TEXT,                     -- for capture events
    final_text TEXT,                        -- for confirmed/edited capture events
    scope TEXT NOT NULL,
    class_id TEXT,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_files_teacher ON memory_files(teacher_id);
CREATE INDEX idx_memory_files_class ON memory_files(teacher_id, class_id);
CREATE INDEX idx_memory_events_trace ON memory_events(trace_id);
CREATE INDEX idx_memory_events_session ON memory_events(session_id);
```

### Session search support

```sql
-- Add full-text search to sessions for search_sessions tool
ALTER TABLE sessions ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(messages_text, ''))) STORED;

CREATE INDEX idx_sessions_search ON sessions USING GIN(search_vector);
CREATE INDEX idx_sessions_teacher_class ON sessions(teacher_id, class_id);
CREATE INDEX idx_sessions_teacher_date ON sessions(teacher_id, updated_at DESC);
```

---

## Evaluation Strategy

### Testing Pyramid

We will be using TDD (Test driven development approach) write your tests first.

```
                    ┌─────────────┐
                    │  Agent Evals │  Slow, expensive, stochastic
                    │  (model in   │  Quality scores, not pass/fail
                    │   the loop)  │  Run deliberately, not on commit
                 ┌──┴─────────────┴──┐
                 │  Integration Tests │  Mock model, real tools
                 │  (loop mechanics)  │  Verify orchestration logic
              ┌──┴───────────────────┴──┐
              │     Unit Tests           │  Fast, deterministic
              │  (tools, parsing, types) │  Standard TDD, run on commit
              └──────────────────────────┘
```

### Unit Tests (Layer 1)

Fast, deterministic. Run on every commit.

- Frontmatter parsing (all fields, defaults, validation — including `memory` field)
- Tool execution (file tools, read_skill tiers, update_tasks, read_memory, update_memory, search_sessions, read_session)
- Tool retry and no-progress detectors (`maxToolRetries`, `maxNoProgressIterations`, `forceFinalizeOnStall`)
- System prompt assembly (ordering, XML sections, manifest content, identity at position 1, teacher memory at position 4, class memory at position 5)
- Session persistence (save/load round-trip, adjudication + feedforward + memory-capture decisions preserved)
- Trace structure (sessionId, span types, adjudication + feedforward + reflection + memory event data)
- Model adapter format (provider-specific placement)
- Hook resolution (merge order, unknown hooks)
- Curriculum evidence parsing (evidence pointers, file validation)
- Memory file CRUD (create, read, update, scope isolation, teacher-id isolation)
- Memory MEMORY.md truncation (only first 200 lines loaded into prompt)
- Memory ranking score and deterministic ordering under token budget
- Memory consolidation thresholding (short-term → long-term promotion)
- Session search (full-text search, class filter, date range filter)

### Integration Tests (Layer 2)

Mock model with scripted responses. Real tools against temp filesystem and test database. Tests orchestration.

- Basic loop (tool call → execute → respond → terminate)
- Skill loading flow (Tier 2 → Tier 3 escalation, traced)
- Skill reference expansion flow (inline references, bounded recursion, circular detection)
- Memory loading flow (teacher MEMORY.md in prompt, class MEMORY.md loaded by feedforward, topic files via read_memory)
- Memory write flow (agent update_memory → trace event, memory-capture hook → teacher confirmation → write + trace event)
- Memory consolidation flow (end-of-session promotion with provenance in trace)
- Safety limits (maxTurns, maxBudget)
- Stall/retry resilience (repeated tool failures and no-progress loops terminate with correct status)
- Hook lifecycle (all points fire correctly, all appear in trace)
- Hook abort (terminates, trace written, correct status)
- Feedforward hook (surfaces workspace + memory context, logs teacher response)
- Reflection prompt hook (generates prompts from context, logs response)
- Memory-capture hook (proposes updates from session, logs teacher decisions, writes confirmed items)
- Curriculum evidence guardrail (valid/invalid/fabricated outcomes)
- Teacher adjudication hook (decisions recorded correctly)
- Tool errors (graceful, returned to model)
- Session resume (messages prepended, history preserved)
- Session search (keyword match, class filter, date range, correct results)
- Trace completeness (all spans present with correct types, including memory events)
- Identity loading (soul.md loaded at position 1, missing soul.md handled gracefully)
- Memory disabled (--no-memory flag prevents memory loading and memory tools)

**Phase 2 additions:** Subagent isolation (with memory access), handoff context injection, onHandoff hooks.

### Agent Evals (Layer 3)

Real models, real costs, quality scores not pass/fail.

**Three types of criteria:**

- **Structural (deterministic):** Expected sections present, class context used, curriculum evidence valid, differentiation addressed when workspace flags ASN/EAL. Memory context referenced when available.
- **Model-as-judge (stochastic):** Pedagogical quality against teacher-developed rubric. Curriculum alignment. Age-appropriateness. Whether memory context improved output relevance.
- **Behavioural (from traces):** Skill tier escalation patterns. Workspace and memory context utilisation. Curriculum evidence guardrail pass rate. Feedforward engagement patterns. Memory read/write patterns.

**Eval-driven development:** Define criteria → write agent/skill markdown → run eval → iterate → establish baseline → regression suite.

### Research Data from Evals

- Prompt strategy comparison (skill impact on quality)
- Context ablation (workspace impact independent of skills — product spec sub-question 2)
- Memory ablation (memory-enabled vs. memory-disabled on identical cases over time)
- Model comparison (Phase 2)
- Ablation studies (single-agent vs multi-agent on identical cases)
- Cost/quality tradeoffs (including memory token overhead)
- Curriculum accuracy across configurations
- Skill tier usage patterns

---

## Scope Alignment with Product Spec §6

### MVP (Phase 1) — Single-Agent Research Prototype

Everything listed in product spec "In scope":


| Product spec requirement                     | Dev spec implementation                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace setup and loading                  | `workspace.ts` + seed files (teacher, 2-3 classes, pedagogy, curriculum, soul.md)                                                                 |
| Assistant identity (`soul.md`)               | `workspace/soul.md` loaded at position 1 in prompt assembly. Teacher-editable via workspace sidebar                                               |
| Lesson planning plugin with create/refine    | `plugins/lesson-planning/` with commands, planner agent                                                                                           |
| Planner agent with workspace + skills        | `agent.ts` + `prompt.ts` with progressive skill loading                                                                                           |
| Interchangeable LLM (Anthropic/OpenAI)       | `model.ts` adapter — Anthropic and OpenAI                                                                                                        |
| 4-6 pedagogical skills                       | backward-design, differentiation, lesson-structure, retrieval-practice, cognitive-load, formative-assessment, metacognition, designing-for-equity |
| CfE curriculum for 5+ subjects               | Workspace curriculum files for Computing, Maths, English, French, History                                                                         |
| Minimal web UI (split-pane)                  | React + Tailwind frontend with workspace sidebar + chat + adjudication + memory UI                                                                |
| Session persistence                          | `sessions.ts` with PostgreSQL                                                                                                                     |
| Trace logging with session correlation       | `traces.ts` with full span coverage including memory events                                                                                       |
| Teacher adjudication hook                    | `teacher-adjudication.ts` with Accept/Revise/Alternatives + trace logging                                                                         |
| Feedforward hook                             | `feedforward.ts` — surfaces workspace + memory context before generation                                                                         |
| Reflection prompt hook                       | `reflection-prompt.ts` — scaffolds evaluation before adjudication                                                                                |
| Memory (teacher + class scopes)              | `tools/memory.ts` with read_memory/update_memory + PostgreSQL storage + memory-capture hook                                                       |
| Session search                               | `tools/sessions.ts` with search_sessions/read_session + PostgreSQL full-text search                                                               |
| Guardrails (scope, age, curriculum evidence) | Hook implementations with abort on failure                                                                                                        |
| Simple auth                                  | Researcher passcode on backend server                                                                                                             |

### Out of Scope for MVP

- Subagents and handoffs (Phase 2)
- Update-memory plugin (researcher updates workspace manually)
- MCP integration
- Streaming

---

## Technical Decisions

- **Runtime:** Bun (fast startup, native TypeScript, built-in test runner)
- **Database:** PostgreSQL for sessions, traces, and memory. Provides full-text search for session lookup, JSONB for flexible trace/memory storage, and proper multi-tenant isolation via teacher_id
- **Model default:** Claude Sonnet 4 for planner agent. Haiku for hooks that call a model and subagent tasks where cost matters
- **Frontend:** React + Tailwind CSS + TypeScript. Vite for build/dev server. Zustand for state. CodeMirror for workspace editing.
- **No heavy framework dependencies:** The backend is small enough that a framework adds complexity without value
- **Markdown-first:** Agents, skills, workspace (including soul.md), commands are all markdown with YAML frontmatter
- **Memory as virtual markdown:** Memory stored in PostgreSQL but exposed to the agent as virtual markdown files via tools, maintaining the Claude Code mental model
- **Monorepo:** `packages/backend` and `packages/frontend` with shared types
- **Claude Code compatible:** Skills and workspace follow Claude Code conventions. Memory follows the auto-memory pattern (MEMORY.md entrypoint + topic files, 200-line load limit)
