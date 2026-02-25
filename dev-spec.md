# teacher-assist — Technical Development Spec

Companion to the [Product & Research Specification](./teacher-assist-product-spec.md). This document covers architecture, behaviour, evaluation strategy, and implementation tasks. It assumes familiarity with the product rationale and phasing described there.

-----

## Architecture Overview

The runtime is a tool-use loop. The real value lives in markdown definitions and context files.

```
┌──────────────────────────────────────────────────────────┐
│  Web UI (Phase 1) / CLI                                  │
│  Split-pane: workspace editor + chat                     │
│  "lesson-planning:create-lesson 'recursion for 1B'"      │
└────────────────────────┬─────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │    preLoop hooks    │ ← input validation, guardrails
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
│                                                          │
│  Phase 2 additions:                                      │
│  ┌─────────────────┐ ┌───────────────────────────┐       │
│  │ spawn_subagent  │ │ transfer_to_<agent_name>  │       │
│  └─────────────────┘ └───────────────────────────┘       │
└──────────────────────────┬───────────────────────────────┘
                           │
                ┌──────────▼──────────┐
                │   postLoop hooks    │ ← output validation, guardrails,
                │                     │   teacher adjudication gate
                └──────────┬──────────┘
                           │
               ┌───────────▼───────────┐
               │  Session + Trace      │
               └───────────────────────┘
```

### Primitives

- **Workspace** — persistent educator context (teacher profile, class profiles, pedagogy preferences, curriculum references with progression relationships) stored as markdown files. Equivalent to CLAUDE.md in Claude Code — always loaded into the system prompt
- **Plugins** — domain-specific bundles of agents, skills, commands, and hooks
- **Agents** — LLMs configured with instructions, tools, and access to workspace and skills
- **Skills** — pedagogical domain knowledge loaded progressively across three tiers, following the Claude Code / Anthropic Agent SDK pattern
- **Commands** — named entry points that frame a task and route to the right agent
- **Hooks** — lifecycle callbacks that run at defined points in the agent loop. Hooks can inspect, log, modify, or abort. Guardrails are hooks that validate content and abort on failure. The teacher adjudication gate is a hook that presents decision controls and logs responses
- **Sessions** — persistent conversation history across invocations
- **Traces** — structured execution logs for research analysis and debugging, with session ID for cross-session correlation
- **Subagents** — agents spawned in isolated context, returning summaries to parent (Phase 2)
- **Handoffs** — agents transferring control to a peer agent with structured context injection (Phase 2)

-----

## Design Heritage

The architecture is intentionally aligned with Claude Code and the Anthropic Agent SDK so that the same skill files, workspace content, and conventions work in both the custom agent loop and directly with Claude Code during development and iteration. The runtime uses an OpenAI-compatible provider adapter (Phase 2) for model comparison studies, while file/skill/tool conventions remain Claude-compatible.

| Concept | Claude Code | Anthropic Agent SDK | OpenAI Agents SDK | teacher-assist |
|---|---|---|---|---|
| Core loop | Agentic tool-use loop | `query()` async generator | `Runner.run()` | `runAgentLoop()` |
| Multi-agent (isolated) | Subagents | `Task` tool | Agents as tools | `spawn_subagent` (Phase 2) |
| Multi-agent (shared) | — | — | Handoffs | `transfer_to_*` with context injection (Phase 2) |
| Context | CLAUDE.md | System prompt | Instructions | CLAUDE.md + workspace/ |
| Skills | Skills directories with SKILL.md | Progressive (3-tier) | N/A | Progressive (3-tier) |
| Validation | — | Hooks (PreToolUse) | Guardrails | Hooks (some implement guardrails) |
| Persistence | JSONL transcripts | `resume` by session ID | Sessions | Sessions (JSON) |
| Observability | — | `SDKResultMessage` | Tracing with spans | Traces with spans + sessionId |
| Safety limits | — | `maxTurns`, `maxBudgetUsd` | `max_turns` | `maxTurns`, `maxBudgetUsd` |
| Structured output | — | `outputFormat` | `output_type` | `outputSchema` |

### Claude Code Compatibility

A deliberate design goal is that the project's skill and workspace files are directly usable by Claude Code. This means:

- **CLAUDE.md** at the project root serves as the top-level context file, just as in any Claude Code project. It describes the project, points to workspace files, and lists conventions
- **Skills follow the Claude Code directory convention:** each skill is a directory containing a `SKILL.md` file (Tier 2) and optional reference files (Tier 3). Claude Code can read these directly via its own skill-loading mechanism
- **Workspace files are plain markdown** that Claude Code can read via file tools without any custom infrastructure
- **During development**, a developer can use Claude Code against the project to iterate on skills, workspace content, and agent prompts without running the custom agent loop. The same files serve both contexts
- **The custom agent loop adds** what Claude Code doesn't provide: hooks, sessions, traces, structured commands, plugin scoping, teacher adjudication gates, and the multi-agent patterns (Phase 2). These are the research-specific capabilities

### OpenAI Provider Compatibility (Phase 2)

File/skill/tool conventions remain Claude-compatible so skill definitions and workflows are reusable. The OpenAI provider adapter implements: tool calling format translation, structured output enforcement, cost and token accounting, and trace normalisation. This enables model comparison studies (e.g., Sonnet vs GPT-4o) on identical eval cases without changing skill or workspace content.

-----

## File Structure

```
teacher-assist/
├── CLAUDE.md              # Project-level context (Claude Code compatible)
├── src/
│   ├── types.ts           # Core interfaces
│   ├── model.ts           # Model adapter (Anthropic Phase 1, OpenAI Phase 2)
│   ├── tools/
│   │   ├── registry.ts    # Tool registration, dispatch, schema generation
│   │   ├── files.ts       # read_file, write_file, str_replace, list_directory
│   │   ├── bash.ts        # Shell command execution (dev/eval only, not planner agent)
│   │   ├── skills.ts      # read_skill (progressive loading across 3 tiers)
│   │   ├── tasks.ts       # update_tasks (task tracking)
│   │   ├── subagent.ts    # spawn_subagent (Phase 2)
│   │   └── handoff.ts     # transfer_to_* generation with context injection (Phase 2)
│   ├── workspace.ts       # Workspace loading
│   ├── plugins.ts         # Plugin/agent/command/skill/hook discovery + frontmatter
│   ├── prompt.ts          # System prompt assembly
│   ├── agent.ts           # runAgentLoop() — core loop
│   ├── hooks.ts           # Hook resolution, execution, abort error
│   ├── sessions.ts        # Session persistence
│   ├── traces.ts          # Trace logging
│   ├── cli.ts             # CLI entry point
│   └── ui/                # Minimal web UI (Phase 1)
│       ├── server.ts      # Local dev server
│       └── client/        # Split-pane: workspace editor + chat
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
│       │   └── formative-assessment/
│       │       ├── SKILL.md
│       │       └── techniques.md
│       └── hooks/
│           ├── scope-check.ts
│           ├── age-appropriate.ts
│           ├── curriculum-evidence.ts
│           └── teacher-adjudication.ts
├── workspace/
│   ├── teacher.md
│   ├── pedagogy.md
│   ├── curriculum/
│   │   ├── cfe-computing.md
│   │   └── cfe-technologies.md
│   └── classes/
│       ├── 1B.md
│       └── 2A.md
├── sessions/              # JSON (gitignored)
├── traces/                # JSON (gitignored)
├── evals/
│   ├── helpers/
│   ├── unit/
│   ├── integration/
│   └── agent/
├── package.json
├── tsconfig.json
└── .env
```

-----

## Behavioural Specification

### Agent Loop

The agent loop is the core runtime. It takes an agent definition, optional command framing, user input, and available tools, then runs a model-tool cycle until the model responds without tool calls or a safety limit is reached.

**Behaviour:**

1. Resolve and merge hooks from the agent definition and any caller-provided hooks
2. Run **preLoop** hooks. Any hook may throw a hook abort error to terminate immediately
3. Assemble the system prompt from agent instructions, workspace context, skill manifest, and command framing
4. Load session messages if resuming, append the new user input
5. Enter the loop:
   - Check safety limits (maxTurns, maxBudgetUsd). Return error status if exceeded
   - Run **preModel** hooks
   - Call the model with system prompt, messages, and tool definitions
   - Run **postModel** hooks
   - Record token usage and cost in the trace
   - If no tool calls in response: run **postLoop** hooks (including teacher adjudication gate), persist session and trace, return result
   - If tool calls: for each call, run **preTool** hooks, execute the tool, run **postTool** hooks, append result to messages
6. If a hook abort error is thrown at any point, write the trace and return with abort status and reason

**Error handling:** Tool execution errors (exceptions, unknown tools) are caught and returned as tool result messages so the model can reason about them. Hook abort errors are the only exception type that terminates the loop — they propagate through tool errors.

**Status codes:** `success`, `error_max_turns`, `error_max_budget`, `error_hook_abort`

### Hooks

Hooks are lifecycle callbacks that run at defined points in the agent loop. They are the single extension mechanism — guardrails, logging, cost tracking, teacher adjudication, and research instrumentation are all implemented as hooks.

**Lifecycle points:**

| Hook | When it runs | Typical use |
|---|---|---|
| preLoop | Before first model call, after user input received | Input validation guardrails, input logging |
| postLoop | After final model response (no more tool calls) | Output validation guardrails, teacher adjudication gate, output logging |
| preModel | Before each model call | Message inspection, token budget checks |
| postModel | After each model response | Response logging, content filtering |
| preTool | Before each tool execution | Tool call validation, permission checks |
| postTool | After each tool execution | Result logging, result modification |
| onHandoff | When an agent hands off to another (Phase 2) | Logging, policy checks, context validation |
| onSubagentStart | When a subagent is spawned (Phase 2) | Logging, budget allocation |
| onSubagentEnd | When a subagent completes (Phase 2) | Result inspection, logging |

**Abort behaviour:** Any hook may throw a hook abort error with a name and reason. This immediately terminates the agent loop and returns an error result. This is how guardrails work — they are hooks that validate content and abort if validation fails.

**Hook resolution:** An agent definition lists hook names. The runtime resolves these to hook implementations from the plugin's `hooks/` directory. Caller-provided hooks (via run options) are merged and run after agent-defined hooks.

**Trace integration:** Every hook execution is recorded as a span in the trace, including whether it passed or aborted.

### Guardrails (as Hooks)

Guardrails are not a separate primitive — they are hooks that validate content and abort on failure. Phase 1 provides:

**scope-check** (preLoop): Validates that the user's request is within the plugin's domain. For the lesson-planning plugin, this rejects requests for UCAS references, report writing, and other non-planning tasks. Phase 1 uses simple heuristics; Phase 2 can upgrade to model-based classification.

**age-appropriate** (postLoop): Validates that the agent's output is appropriate for the year group specified in the workspace class profile. Checks for content complexity mismatches.

**curriculum-evidence** (postLoop): Validates that any curriculum alignment claim in the agent's output includes verifiable evidence pointers. Checks that referenced curriculum files exist in workspace, line ranges are valid, quoted text matches file content, and no "invented outcomes" appear. This directly addresses the curriculum hallucination risk.

**teacher-adjudication** (postLoop): Presents Accept / Revise / Generate Alternatives controls per section (or per artefact bundle). Logs decisions into trace spans with decision type, section, timestamp, and any revision request text. Optionally blocks finalisation until each section has a decision. In CLI mode, this presents as a text prompt; in web UI mode, as interactive controls.

### Progressive Skill Loading (3-Tier)

Three tiers, matching the Claude Code and Anthropic Agent SDK architecture. Each tier increases token cost but provides richer context. The agent controls when to escalate from Tier 1 → 2 → 3.

**Tier 1 — Manifest (always in system prompt)**

Skill names and one-line descriptions, ~100 tokens per skill. The agent sees what knowledge domains are available and decides which to explore further.

Example manifest entry:

```
- backward-design: Wiggins & McTighe backward design framework for lesson planning
```

The manifest is generated from each skill's SKILL.md frontmatter `description` field.

**Tier 2 — SKILL.md (loaded on first relevance)**

The skill's SKILL.md file: overview, when to use it, key concepts, and pointers to Tier 3 reference files. Typically 500-1500 tokens. Loaded when the agent calls `read_skill <name>`.

This is the same file Claude Code reads when it encounters a skills directory. The content should be self-contained enough to guide the agent for common cases, with explicit references to Tier 3 files for detailed content.

SKILL.md should include:

- When to use this skill and when not to
- Key principles or steps (concise)
- What reference files are available in the directory and when to consult them

**Tier 3 — Reference files (loaded on demand for specific needs)**

Detailed content within the skill directory: full frameworks, worked examples, rubrics, strategy lists, curriculum mappings. Loaded when the agent calls `read_skill <name>/<filename>`.

Examples: `backward-design/framework.md` (full 3-stage process), `differentiation/eal-strategies.md` (detailed EAL scaffolding techniques), `retrieval-practice/techniques.md` (catalogue of retrieval practice activities).

**Why 3 tiers matters:** A lesson on recursion for an advanced class might only need Tier 1 (the agent knows backward design exists) and Tier 2 (the key steps). A lesson for a class with EAL students needs Tier 3 from the differentiation skill (specific EAL strategies). The agent decides based on the workspace context and user request — the same cost-saving logic as Claude Code's progressive skill loading.

### System Prompt Assembly

The system prompt is composed from multiple sources in a defined order:

1. **Agent identity and instructions** — the agent's markdown body
2. **Workspace context** — content of workspace files referenced by the agent definition (teacher profile, class profiles, pedagogy, curriculum)
3. **Skill manifest** — names and descriptions of available skills (Tier 1 only)
4. **Command-specific framing** — the command's markdown body, if a command was invoked
5. **Available subagents manifest** — names and descriptions (Phase 2)
6. **Handoff targets** — names and descriptions (Phase 2)
7. **Task list** — any pending tasks from the session

Each section is wrapped in XML tags for clarity. Sections 3-7 add ~200-400 tokens of overhead. Tier 2 and Tier 3 skill content is only added to the conversation when the agent calls `read_skill`.

### Subagents (Phase 2)

Subagents are spawned via a `spawn_subagent` tool call. They run in isolated context — fresh message history, no access to the parent's conversation — and return a summary as a tool result to the parent.

The parent provides a structured task context when spawning:

```typescript
spawn_subagent({
  agent: "resource-creator",
  task: "Create a worksheet on iteration for S3 Computing Science",
  context: {
    decisions: "Lesson uses worked-example-then-practice structure, 50min",
    constraints: "Must align to TCH 3-13a, class 3B mixed ability, 2 EAL students (Ukrainian)",
    deliverable: "10-question worksheet with differentiated difficulty levels"
  }
})
```

**Constraints:**

- Cannot spawn further subagents (depth capped at 1)
- Cannot perform handoffs
- Inherit workspace access but not conversation history
- Have their own maxTurns (default 10, lower than main agent)
- Output includes a summary of decisions made and any constraints encountered

**Use case:** Planner delegates worksheet creation to `resource-creator`, gets back a summary and the worksheet content, continues planning.

### Handoffs (Phase 2)

Handoffs transfer control from one agent to another. The conversation history is preserved — the new agent continues with the same messages but a different system prompt and tool set.

**Handoff context injection:** When an agent triggers a handoff via `transfer_to_<agent>`, the runtime injects a handoff context block into the message history before the new agent's first turn. This block is generated by the outgoing agent as a required parameter of the handoff tool call:

```typescript
transfer_to_differentiation_specialist({
  context: {
    decisions: "Lesson uses worked-example-then-practice structure, 50min, starter is retrieval practice quiz on previous lesson. Three main activities planned.",
    constraints: "Must align to TCH 3-13a, class 3B has 2 EAL students (Ukrainian), 1 student with dyslexia. Teacher prefers visual scaffolding.",
    reason: "Teacher wants detailed differentiation strategies for the practice activity phase",
    open_questions: "Whether to use tiered tasks or flexible grouping for the independent practice section"
  }
})
```

The incoming agent receives this as a structured context block in its message history, after the conversation messages but before its first response. This ensures the new agent honours commitments made by the previous agent and focuses on the right problem.

**Behaviour:** Handoffs are implemented as dynamically generated tools from the agent's `handoffs` list. When the model calls `transfer_to_<n>`, the loop validates the context parameter, injects the context block, swaps the active agent definition, reassembles the system prompt, resolves new tools, and continues.

**Constraints:**

- Unlimited chaining (A → B → C → A)
- Tools are resolved fresh for the new agent
- Handoff context block is required (tool call fails without it)
- onHandoff hooks run at each transition and can inspect the context block

**Use case:** Planner realises the teacher wants to rethink differentiation entirely, hands off to `differentiation-specialist` who continues the conversation with full knowledge of what the planner already decided.

### Sessions

Sessions persist conversation history across invocations. One JSON file per session.

**Behaviour:**

- New session created when a command runs without `--resume`
- Existing session loaded when `--resume <id>` is provided; messages are prepended to the loop
- Sessions store: id, plugin, command, agent name, messages, tasks, adjudication decisions, timestamps
- Sessions are listed with optional plugin filtering and sorted by last update

### Traces

Every agent loop invocation produces a trace. Traces are the primary research data artefact.

**What traces capture:**

- **Session reference** — `sessionId` as a top-level field for cross-session correlation
- **Model calls** — with token counts, cost estimates, and stop reason
- **Tool calls** — with arguments and results (including which skill tier was loaded)
- **Hook executions** — with pass/abort status
- **Teacher adjudication decisions** — decision type (accept/revise/alternatives), section, timestamp, revision request text
- **Curriculum evidence checks** — referenced files, line ranges, match status
- **Subagent invocations** (Phase 2) — nested as child spans, including task context provided
- **Handoffs** (Phase 2) — from/to agent names, handoff context block

**Structure:** A trace contains a top-level `sessionId`, metadata (timestamp, plugin, command, agent), and a list of spans. Each span has a type, name, timestamps, and optional input/output. Subagent spans nest via a parent span reference.

### Model Abstraction

Phase 1 implements Anthropic only. Phase 2 adds OpenAI for comparative studies.

The model adapter handles format differences between providers: system prompt placement, tool definition format, tool use/result message format, and structured output mechanism. Each provider adapter should be small and isolated. The adapter also normalises cost and token accounting for trace logging, enabling direct cost comparison across providers on identical eval cases.

### Tools

**Planner agent tools (Phase 1):**

| Tool | Behaviour |
|---|---|
| read_file | Returns file content with line numbers |
| write_file | Creates or overwrites a file |
| str_replace | Replaces an exact string match in a file. Fails if the string is not found or appears more than once |
| list_directory | Returns directory listing with nesting |
| read_skill | Loads skill content by reference. `read_skill backward-design` returns SKILL.md (Tier 2). `read_skill backward-design/framework` returns framework.md (Tier 3). Returns an error if the skill or file doesn't exist |
| update_tasks | Adds, updates, or completes tasks in the session task list |

**Note on bash:** The `bash` tool is available for eval harness execution and developer use via Claude Code, but is not included in the planner agent's tool set. The planner agent operates only on file tools, skill reading, and task management. This avoids unnecessary attack surface and keeps the agent focused on its planning domain.

**Phase 2 additions:**

| Tool | Behaviour |
|---|---|
| spawn_subagent | Spawns a named agent in isolated context with structured task context (decisions, constraints, deliverable). Returns the subagent's final output and decision summary as a tool result |
| transfer_to_* | Dynamically generated from agent's handoffs list. Requires structured context parameter (decisions, constraints, reason, open questions). Triggers agent swap in the loop with context injection |

### Workspace Content

#### Curriculum files with progression relationships

Workspace curriculum files encode not just individual outcomes but their relationships, assessment expectations, and common misconceptions. This gives the agent enough structure to avoid curriculum hallucination:

```markdown
## TCH 3-13a — Iteration
- **Outcome text**: I can create, with increasing independence, parsing code…
- **Progression from**: TCH 2-13a (sequencing and repetition at Second Level)
- **Progression to**: National 4 Software Design and Development (iteration with conditions)
- **Assessment expectations**: Can trace through a loop, predict output, write simple loops with known iteration count
- **Common misconceptions**: Confusing loop counter with accumulator, off-by-one errors, infinite loops
- **Cross-references**: Links to TCH 3-14a (selection) — students often confuse conditional iteration with selection
- **Typical prior knowledge**: Students have used repeat blocks in Scratch; may not have encountered text-based loop syntax
```

This representation supports the curriculum evidence guardrail: the agent can cite specific outcomes with line references, and the guardrail can verify that cited text matches the source file.

#### Class profiles (anonymised)

Class profiles contain anonymised need descriptors only — no student names, identifiers, or data that could link to specific children:

```markdown
## Class 3B — S3 Computing Science
- 28 students, mixed ability
- 2 students with EAL (Ukrainian) — conversational English, limited technical vocabulary
- 1 student with dyslexia — benefits from visual scaffolding and reduced text density
- 3 students working significantly above expected level
- Prior knowledge: completed iteration unit at Second Level, variable confidence with nested structures
```

### Markdown Formats

#### CLAUDE.md (project root)

The project-level context file, compatible with Claude Code. Describes the project purpose, points to workspace and skill directories, and lists development conventions. When working with Claude Code directly, this is the entry point. When running the custom agent loop, the workspace files provide the educator context that CLAUDE.md points to.

#### Agent definitions

Markdown files with YAML frontmatter. The frontmatter configures the agent; the body provides system prompt instructions.

| Field | Type | Default | Description |
|---|---|---|---|
| model | string | required | Model identifier |
| provider | string | required | `anthropic` or `openai` |
| workspace | string[] | `[]` | Workspace file references to include in context |
| skills | string[] | `[]` | Skill directory names for manifest and progressive loading |
| tools | string[] | `[]` (all) | Tool names to make available. Empty means all built-in tools except bash |
| hooks | string[] | `[]` | Named hooks to run during this agent's loop |
| handoffs | string[] | `[]` | Agent names this agent can hand off to (Phase 2) |
| outputSchema | object | none | JSON Schema for structured output |
| maxTurns | number | 25 | Maximum loop iterations |
| maxBudgetUsd | number | none | Maximum API spend |

#### Command definitions

Markdown files with YAML frontmatter. The body provides task-specific framing appended to the system prompt.

| Field | Type | Default | Description |
|---|---|---|---|
| agent | string | required | Agent to invoke |
| description | string | required | Shown in `--list` |
| mode | string | `single` | `single` (one response) or `interactive` (REPL / chat) |
| writes | string | none | Expected output path |

#### Skills (3-tier directory structure)

Each skill is a **directory** (not a single file), following the Claude Code skills convention:

```
skills/
└── backward-design/
    ├── SKILL.md           # Tier 2: overview, when to use, key steps, file index
    ├── framework.md       # Tier 3: detailed framework content
    └── examples.md        # Tier 3: worked examples
```

**SKILL.md frontmatter** provides the Tier 1 manifest entry:

| Field | Type | Description |
|---|---|---|
| description | string | One-line summary for the Tier 1 manifest (~10-15 words) |

The SKILL.md body is the Tier 2 content. It should reference available Tier 3 files so the agent knows what deeper content exists.

**Tier 3 files** are plain markdown with no required frontmatter. They contain the detailed reference content: full frameworks, strategy catalogues, worked examples, curriculum mappings, rubrics.

This structure means Claude Code can discover and read skills using its native mechanism — `view skills/backward-design/SKILL.md` — with no custom tooling required.

### Web UI (Phase 1)

A minimal local web application providing a split-pane interface for researcher-mediated user studies. This is not a production UI — it replaces the CLI for study sessions to reduce friction and avoid confounding timing measurements.

**Components:**

- **Workspace sidebar**: CodeMirror or Monaco editor showing workspace markdown files (teacher profile, class profiles, pedagogy preferences). Teachers can edit files directly; changes persist to the filesystem
- **Chat window**: Wraps the interactive REPL mode. Displays agent responses with section structure. Presents teacher adjudication controls (Accept / Revise / Generate Alternatives) inline after each section or artefact
- **Session management**: Resume previous sessions, view session list

**Technical approach:** Local Vite + React app that communicates with the existing agent loop via a lightweight server (WebSocket or HTTP). The chat window calls the same `runAgentLoop()` function as the CLI. No auth, no multi-user — runs on `localhost` for study sessions.

**Implementation estimate:** 2-3 days. The UI doesn't need to be polished — it needs to be less intimidating than a terminal.

### CLI

The CLI remains available for developer use, eval execution, and trace inspection.

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
  --serve                     Start web UI server
```

-----

## Evaluation Strategy

### Testing Pyramid

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

Fast, deterministic. Write before implementation. Run on every commit.

**What to test:**

- **Frontmatter parsing:** All fields present, missing optional fields get defaults, missing required fields throw, invalid values rejected
- **Tool execution:** read_file returns content with line numbers, write_file creates files, str_replace succeeds on exact match and fails on missing/ambiguous match, list_directory returns structure
- **read_skill (3-tier):** `read_skill backward-design` returns SKILL.md content (Tier 2). `read_skill backward-design/framework` returns framework.md content (Tier 3). `read_skill nonexistent` returns clear error. Manifest generation extracts description from SKILL.md frontmatter
- **System prompt assembly:** Workspace content included, skill manifest contains Tier 1 descriptions only (not SKILL.md bodies or Tier 3 content), command framing appended, XML sections present and correctly ordered
- **Session persistence:** Save/load round-trip preserves all fields including adjudication decisions, list returns sessions sorted by update time, plugin filtering works
- **Trace structure:** Traces include sessionId at top level, spans are correctly typed, adjudication decisions are recorded
- **Model adapter format:** System prompt placed correctly per provider, tool definitions formatted correctly, tool call/result messages translated correctly
- **Hook resolution:** Named hooks resolved from plugin directory, caller hooks merged after agent hooks, unknown hook names produce clear errors
- **Curriculum evidence parsing:** Evidence pointers extracted from agent output, file references validated against workspace, line ranges checked

### Integration Tests (Layer 2)

Mock model with scripted responses. Real tools running against a temp filesystem. Tests orchestration logic, not model quality.

**What to test:**

- **Basic loop:** Model returns tool call → tool executes → result appended → model responds with text → loop terminates
- **Skill loading flow:** Model calls read_skill (Tier 2), then read_skill with file path (Tier 3), then uses the knowledge in its response. Trace shows both skill loads
- **Multi-turn:** Model makes several tool calls across multiple turns before producing final output
- **Safety limits:** Loop terminates with `error_max_turns` when limit reached. Loop terminates with `error_max_budget` when cost exceeds threshold
- **Hook lifecycle:** preLoop hooks run before first model call. postLoop hooks run after final response. preTool/postTool hooks run around each tool execution. All hook executions appear as spans in the trace
- **Hook abort:** A hook throwing an abort error terminates the loop immediately. The trace is still written. Status is `error_hook_abort` with the reason
- **Curriculum evidence guardrail:** Output referencing valid Es & Os passes. Output referencing nonexistent outcomes is caught. Output with mismatched line ranges is caught
- **Teacher adjudication hook:** Adjudication decisions are recorded in trace spans with correct structure
- **Tool errors:** Unknown tool name returns error message to model (not a crash). Tool throwing an exception returns error message to model. Hook abort errors propagate through tool error handling
- **Bash restriction:** Planner agent tool set does not include bash. Eval harness can use bash
- **Session resume:** Messages from a saved session are present when the loop resumes. Adjudication history preserved
- **Trace completeness:** Trace contains sessionId, spans for every model call, tool call, and hook execution, with correct types and timestamps

**Phase 2 additions:**

- Subagent runs with fresh messages and structured task context, not parent's history. Output returned as tool result with decision summary. Cannot spawn further subagents
- Handoff requires context parameter (fails without it). Context block injected into message history. Preserves messages, swaps agent, reassembles prompt, resolves tools. onHandoff hooks fire and can inspect context

### Agent Evals (Layer 3)

Real models, real API costs, quality scores not pass/fail. Run deliberately during prompt iteration, not on every commit.

**Eval case structure:** Each case specifies a plugin, command, user input, workspace content, and a set of criteria to evaluate against.

**Three types of criteria:**

**Structural (deterministic, cheap):** Does the output contain expected sections? Learning outcomes present? Assessment evidence? Differentiation? Timings? Correct class references from workspace? Curriculum evidence pointers present and valid?

**Model-as-judge (stochastic, expensive):** Pedagogical quality rated against the teacher-developed rubric (§7.2 of Product Spec) adapted into a scoring prompt. Curriculum alignment checked against Es & Os. Age-appropriateness for the year group. Uses a cheap model as judge, validated against teacher ratings on a calibration set.

**Behavioural (from trace data):** Which skill tiers did the agent load? Did it escalate from Tier 2 to Tier 3 when the task warranted it? Did it reference workspace context? Did the curriculum evidence guardrail pass? Phase 2: Did it delegate to the right subagent? Did it hand off when appropriate? Was the handoff context accurate and complete?

**Reports:** Each eval run produces a markdown report with per-criterion scores, cost, token usage, turn count, and a link to the trace file.

### Eval-Driven Development

The core workflow for iterating on agents, skills, and commands:

1. Define what "good" looks like → write eval case with criteria
2. Write the agent/skill/command markdown → the "implementation"
3. Run the eval → see what scores low
4. Iterate on the markdown → adjust instructions, skills, workspace content
5. Run the eval again → track improvement
6. Establish baseline → regression suite for future changes

Note: steps 2-4 can also be done using Claude Code directly against the project, since skills and workspace follow Claude Code conventions. The eval framework then validates the changes programmatically.

### Research Data from Evals

- **Prompt strategy comparison:** Does adding a skill improve the pedagogical quality score? Does Tier 3 content improve scores over Tier 2 alone?
- **Context ablation:** Does workspace context improve output quality independently of skill support? (Addresses Sub-question 1)
- **Model comparison:** Sonnet vs GPT-4o on identical cases (Phase 2)
- **Ablation studies:** Single-agent (Phase 1) vs multi-agent (Phase 2) on identical cases
- **Skill loading analysis:** Which tiers do agents actually use? Is Tier 3 consulted more for differentiation-heavy tasks? (Trace data)
- **Cost/quality tradeoffs:** Is a cheaper model sufficient for subagent tasks? Does restricting to Tier 2 save cost without hurting quality?
- **Curriculum accuracy:** What proportion of curriculum references pass the evidence guardrail across different configurations?
- **Longitudinal improvement:** Scores over iterations, captured in traces and reports

-----

## Implementation Plan

### Technical Decisions

- **Runtime:** Bun (fast startup, native TypeScript, built-in test runner)
- **Model default:** Claude Sonnet 4 for planner agent. Haiku for hooks that call a model and subagent tasks where cost matters
- **No framework dependencies:** The system is small enough that a framework adds complexity without value
- **Markdown-first:** Agents, skills, workspace, commands are all markdown with YAML frontmatter — legible, diffable, accessible for teacher co-design
- **Claude Code compatible:** Skills and workspace follow Claude Code conventions. A developer can use Claude Code against the project to iterate on content without running the custom loop
- **Minimal web UI:** Local Vite + React for study sessions. Not a production frontend

-----

### Phase 1: Single-Agent Research Prototype

Goal: working system sufficient to run a user study with 6-10 teachers. Single planner agent with workspace context, 3-tier progressive skills, hooks (including teacher adjudication and curriculum evidence), sessions, traces, and a minimal web UI. No subagents, no handoffs, Anthropic only.

#### Milestone 1 — Foundation

Build the minimum vertical slice: call a model, execute tools, loop until done.

| ID | Task | Acceptance criteria |
|---|---|---|
| 1.1 | Project scaffolding + CLAUDE.md | Bun project compiles, test runner works, environment config loaded. CLAUDE.md at project root describes the project, workspace, and skills directories for Claude Code compatibility |
| 1.2 | Core types | Message, tool call, tool definition, model request/response, agent definition, adjudication decision types compile. Introduce incrementally alongside code that uses them |
| 1.3 | Anthropic model adapter | Sends correctly formatted requests to Anthropic API. Parses responses including tool use content blocks. Returns normalised response with token counts |
| 1.4 | Tool registry | Register tools by name. Resolve tools for an agent (filtered subset — planner gets file tools, read_skill, update_tasks; bash excluded). Generate tool definition schemas for model requests |
| 1.5 | File tools | read_file, write_file, str_replace, list_directory operating on a configurable workspace path. str_replace fails clearly on missing or ambiguous matches |
| 1.6 | Bash tool (dev/eval only) | Execute shell commands with configurable timeout and working directory. Return stdout/stderr. Not included in planner agent's tool set |
| 1.7 | Agent loop (basic) | Runs the model-tool cycle. Terminates when model responds without tool calls. Terminates at maxTurns with error status. Tool errors returned as messages to the model, not crashes |

**Deliverable:** Can run the agent loop with a hardcoded agent definition, execute file tools, and get a text response.

#### Milestone 2 — Context System

Make the agent context-aware with workspace, 3-tier skills, and prompt assembly.

| ID | Task | Acceptance criteria |
|---|---|---|
| 2.1 | Frontmatter parser | Parses agent, command, and skill SKILL.md files. Validates required fields, applies defaults, rejects invalid values |
| 2.2 | Workspace loader | Reads markdown files referenced in agent definition. Returns assembled content for prompt injection |
| 2.3 | Skill discovery | Scans skill directories within a plugin. Each skill is a directory containing a SKILL.md. Extracts `description` from SKILL.md frontmatter for Tier 1 manifest. Indexes available Tier 3 files within each directory |
| 2.4 | read_skill tool (3-tier) | `read_skill <name>` returns SKILL.md body content (Tier 2). `read_skill <name>/<file>` returns a specific reference file (Tier 3). Returns clear error for nonexistent skills or files. Traces record which tier was loaded |
| 2.5 | System prompt assembly | Composes prompt from agent body, workspace, Tier 1 skill manifest, command framing, task list. Sections wrapped in XML tags. Tier 1 manifest contains descriptions only — no SKILL.md bodies or Tier 3 content. Correct ordering verified by snapshot tests |
| 2.6 | Plugin discovery | Scans plugin directory. Resolves agents, commands, skills (as directories), hooks by name within a plugin |
| 2.7 | Seed workspace content | Teacher profile, 2-3 class profiles (anonymised need descriptors only), pedagogy preferences. CfE Computing Science and at least one other subject's curriculum references with progression relationships encoded (see Workspace Content section) |
| 2.8 | Seed skills (3-tier) | 6 skills as directories: backward-design, differentiation, lesson-structure, retrieval-practice, cognitive-load, formative-assessment. Each with SKILL.md (overview, when to use, file index) and 1-3 Tier 3 reference files with detailed content grounded in evidence-based pedagogy |

**Deliverable:** `--dry-run` shows a fully assembled system prompt with workspace context and Tier 1 skill manifest. Agent can progressively load Tier 2 then Tier 3 content during execution. Skill files are readable by Claude Code directly.

#### Milestone 3 — CLI, Sessions, Traces

Make it usable and observable.

| ID | Task | Acceptance criteria |
|---|---|---|
| 3.1 | CLI entry point | Parses `<plugin>:<command> "<input>"` syntax. Routes to correct agent. `--list` shows available plugins and commands. `--dry-run` outputs assembled prompt |
| 3.2 | Session persistence | Save and load sessions as JSON files. Sessions store id, plugin, command, agent, messages, tasks, adjudication decisions, timestamps |
| 3.3 | Session resume | `--resume <id>` loads session and prepends messages to agent loop. Multi-turn conversation works across invocations |
| 3.4 | Session listing | `--sessions` lists recent sessions sorted by last update. `--sessions --plugin <n>` filters by plugin |
| 3.5 | Trace logging | Every agent loop run produces a trace with sessionId at top level. Spans for model calls (with token counts), tool calls (with args/results — including skill tier loaded), hook executions, and adjudication decisions. Traces written as JSON files |
| 3.6 | Task tracking tool | update_tasks tool allows agent to add, update, and complete tasks. Tasks persisted in session |

**Deliverable:** Full CLI workflow — run a command, get a response, resume the session, inspect the trace.

#### Milestone 4 — Hooks, Guardrails, Agent Content

Implement hooks framework, guardrails, and core agent definitions.

| ID | Task | Acceptance criteria |
|---|---|---|
| 4.1 | Hook framework | Resolve named hooks from plugin directory. Run hooks at correct lifecycle points (preLoop, postLoop, preModel, postModel, preTool, postTool). Merge agent-defined and caller-provided hooks. All hook executions recorded as trace spans |
| 4.2 | Hook abort mechanism | Any hook can throw an abort error with name and reason. Loop terminates immediately. Trace is still written. Result status is `error_hook_abort` |
| 4.3 | scope-check hook | preLoop hook that validates request is within lesson-planning domain. Rejects out-of-scope requests with clear reason |
| 4.4 | age-appropriate hook | postLoop hook that validates output suitability for the year group in the workspace class profile |
| 4.5 | curriculum-evidence hook | postLoop hook that validates curriculum references in agent output. Checks referenced files exist, line ranges valid, quoted text matches, no invented outcomes |
| 4.6 | teacher-adjudication hook | postLoop hook that presents Accept/Revise/Generate Alternatives controls per section. Logs decisions to trace spans with decision type, section, timestamp, revision text. CLI mode: text prompt. Web UI mode: interactive controls |
| 4.7 | Planner agent definition | Agent markdown with instructions, workspace refs, skills, hooks (excluding bash from tools). This is the core prompt engineering work — iterate using eval framework and/or Claude Code directly |
| 4.8 | Command definitions | create-lesson and refine-lesson commands with task-specific framing |
| 4.9 | Eval framework | Define eval cases with criteria. Run cases and produce scored markdown reports. Support structural, model-as-judge, and behavioural (trace-based) criteria types. Include curriculum evidence accuracy as a structural criterion |
| 4.10 | Eval cases and baseline | Cases covering product spec scenarios (T1: standard lesson, T2: differentiation challenge, T3: new course). Establish baseline scores. Include behavioural criteria for skill tier usage and curriculum evidence accuracy |
| 4.11 | Interactive mode | `--interactive` starts a multi-turn REPL with session persistence and adjudication prompts. For researcher-mediated user studies |

**Deliverable:** Research-ready CLI prototype. Run `create-lesson "iteration for 3B"`, get a pedagogically grounded lesson plan drawing on workspace context and progressively loaded skills, with curriculum evidence guardrail checking, resume sessions, generate traces with adjudication data, and evaluate quality against baseline.

#### Milestone 5 — Web UI

Minimal local web interface for user studies.

| ID | Task | Acceptance criteria |
|---|---|---|
| 5.1 | Local server | Bun/Vite dev server serving the UI on localhost. WebSocket or HTTP bridge to agent loop |
| 5.2 | Workspace editor sidebar | CodeMirror/Monaco editor showing workspace markdown files. File tree navigation. Changes persist to filesystem on save |
| 5.3 | Chat window | Displays agent responses with section structure. Sends user messages to agent loop. Shows typing/loading state |
| 5.4 | Adjudication controls | Accept / Revise / Generate Alternatives buttons rendered inline after each section. Decisions routed through teacher-adjudication hook |
| 5.5 | Session management | Resume previous sessions from UI. Session list view |
| 5.6 | `--serve` flag | CLI flag to start the web UI server instead of the text REPL |

**Deliverable:** Teacher-usable study interface. Open browser, see workspace on left and chat on right, run planning tasks with inline adjudication controls, all backed by the same agent loop as the CLI.

-----

### Phase 2: Multi-Agent + Comparative Study

Goal: add subagents and handoffs with structured context injection, enabling ablation studies against Phase 1 baseline. Add OpenAI provider for model comparison.

| ID | Task | Acceptance criteria |
|---|---|---|
| 2.1 | Subagent tool | Spawns a named agent in isolated context (fresh messages, inherited workspace, structured task context, own maxTurns). Returns final output with decision summary as tool result. Depth capped at 1 — subagents cannot spawn subagents or hand off |
| 2.2 | Handoff tool generation | Dynamically generates transfer_to_* tools from agent's handoffs list. Each tool requires structured context parameter (decisions, constraints, reason, open questions). Triggers agent swap with context injection |
| 2.3 | Agent loop extensions | Handoff path: validate context, inject context block, swap agent, reassemble prompt, resolve tools, continue with same messages. Subagent path: nested loop with task context, return summary. onHandoff, onSubagentStart, onSubagentEnd hooks fire at appropriate points |
| 2.4 | Specialist agents | pedagogy-reviewer, resource-creator, differentiation-specialist agent definitions with appropriate workspace refs, skills, and instructions |
| 2.5 | OpenAI adapter | Model adapter for OpenAI API handling format differences: tool calling, structured output, cost/token accounting, trace normalisation. Provider override via CLI flag |
| 2.6 | Ablation eval cases | Same scenarios as Phase 1 baseline, run against single-agent and multi-agent configurations, across providers. Include skill tier usage comparison and curriculum evidence accuracy comparison |
| 2.7 | Comparative eval tooling | Side-by-side scoring of two configurations with cost/quality tradeoff reporting |
| 2.8 | Update-memory plugin | Plugin for teacher self-service workspace updates, if needed for study design |

-----

### Phase 3: Teacher-Facing Tool (contingent on research findings)

Likely beyond PhD scope. Documented for completeness.

- Streaming responses
- Session compaction when context window exceeded
- Production web UI with auth and multi-tenancy
- MCP integration (Google Classroom, school MIS)
- Additional curriculum support beyond CfE
- School-level deployment with local data handling
- Guided workspace setup flow