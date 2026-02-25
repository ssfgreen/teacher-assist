# teacher-assist — Coding Task List

> **Principle:** Each task produces something runnable. No task is purely structural. You should be able to stop after any sprint and have a working system at that level of capability.

---

## Sprint 0 — Vertical Spike (Day 1)

Get a model calling tools and looping to completion. No abstraction yet. Prove the mechanic works.

**Do not create types.ts, agent.ts, or model.ts yet.** Write this as a single `spike.ts` file you'll throw away (or gut and restructure). The goal is confidence, not architecture.

| # | Task | Done when |
|---|---|---|
| 0.1 | Bun project scaffolding | `bun run spike.ts` executes without errors. `.env` loads `ANTHROPIC_API_KEY` |
| 0.2 | Raw Anthropic API call | Single hardcoded call to `claude-sonnet-4-5` returns a text response. Log it. |
| 0.3 | One tool defined and dispatched | Define `read_file` as a JSON schema tool. Model calls it. You execute it. Append result. Model responds with text. Loop terminates. |
| 0.4 | Multi-turn tool loop | Loop runs until no tool calls in response OR `turns >= 5`. Model reads a real file from disk using `read_file`. |

**Checkpoint:** Run `bun run spike.ts`. Model reads a markdown file from disk and responds with something sensible about it. You now have the core mechanic.

---

## Sprint 1 — Proper Types and Tool Infrastructure (Day 1–2)

Now that the mechanic works, give it real types and extract the tools properly. No agent definitions yet — just clean primitives.

| # | Task | Done when |
|---|---|---|
| 1.1 | Core types (`types.ts`) | `Message`, `ToolCall`, `ToolDefinition`, `ModelResponse`, `LoopResult` compile. Introduce only what Sprint 2 will actually use |
| 1.2 | Anthropic model adapter (`model.ts`) | `callModel(messages, tools, systemPrompt)` → `ModelResponse`. Normalises token counts. No tool execution here |
| 1.3 | File tools (`tools/files.ts`) | `read_file` (with line numbers), `write_file`, `str_replace` (fails clearly on missing/ambiguous match), `list_directory`. Each exports a handler and a JSON schema definition |
| 1.4 | Tool registry (`tools/registry.ts`) | Register tools by name. `getTools(names[])` returns filtered definitions + dispatch map. Resolving an unknown tool returns an error message, not a crash |
| 1.5 | Agent loop (`agent.ts`) | `runAgentLoop(systemPrompt, input, tools, options)` → `LoopResult`. Terminates on: no tool calls, `maxTurns` exceeded. Tool errors returned as messages, never thrown. Replaces spike.ts |

**Test as you go:** One test file per module. `read_file` returns content with line numbers. `str_replace` fails on ambiguous matches. Loop terminates correctly.

**Checkpoint:** `bun test` passes. `bun run src/cli.ts "read the file workspace/teacher.md and tell me about the teacher"` works end-to-end with a real hardcoded system prompt.

---

## Sprint 2 — Context System (Day 2–3)

Make the agent context-aware. Workspace loading, 3-tier skills, system prompt assembly.

| # | Task | Done when |
|---|---|---|
| 2.1 | Frontmatter parser (`plugins.ts`) | Parses YAML frontmatter from markdown files. Validates required fields. Returns typed objects. Unit tests cover: all fields present, optional fields get defaults, missing required fields throw |
| 2.2 | Workspace loader (`workspace.ts`) | Given a list of file paths, reads and returns assembled markdown content for prompt injection. Handles missing files gracefully |
| 2.3 | Skill discovery | Scans a plugin's `skills/` directory. Each skill is a subdirectory with `SKILL.md`. Extracts `description` from frontmatter for Tier 1 manifest. Returns `{ name, description, files[] }` per skill |
| 2.4 | `read_skill` tool (`tools/skills.ts`) | `read_skill backward-design` → SKILL.md body (Tier 2). `read_skill backward-design/framework` → framework.md (Tier 3). Unknown skill → clear error. Trace records which tier was loaded |
| 2.5 | System prompt assembly (`prompt.ts`) | Composes from: agent body, workspace content, Tier 1 manifest (names + descriptions only), command framing, task list. Sections in XML tags. Snapshot test verifies ordering |
| 2.6 | Seed workspace files | `workspace/teacher.md`, `workspace/pedagogy.md`, `workspace/classes/3B.md`, `workspace/curriculum/cfe-computing.md`. Anonymised class profiles. One curriculum file with 3–4 outcomes encoded with progression relationships |
| 2.7 | Seed skills (3-tier) | 3 skills to start: `backward-design`, `differentiation`, `retrieval-practice`. Each has `SKILL.md` (frontmatter description + overview + file index) and at least 1 Tier 3 reference file with real content |

**Checkpoint:** `--dry-run` flag prints the fully assembled system prompt. You can see workspace context and Tier 1 manifest in the output. SKILL.md files are readable by Claude Code directly without any custom tooling.

---

## Sprint 3 — Plugin Discovery, CLI, Sessions (Day 3–4)

Make it invocable by command name and resumable across sessions.

| # | Task | Done when |
|---|---|---|
| 3.1 | Agent + command definitions | `plugins/lesson-planning/agents/planner.md` with real frontmatter (model, workspace refs, skills list, hooks list, maxTurns). `plugins/lesson-planning/commands/create-lesson.md` and `refine-lesson.md` with task-specific framing |
| 3.2 | Plugin discovery (complete) | Scans `plugins/` directory. Resolves agents, commands, skills, hooks by name for a given plugin. Returns structured plugin manifest |
| 3.3 | CLI entry point (`cli.ts`) | Parses `<plugin>:<command> "<input>"` syntax. Routes to correct agent with assembled context. `--list` shows all plugins/commands. `--dry-run` prints assembled prompt. `--interactive` starts REPL |
| 3.4 | Session persistence (`sessions.ts`) | Save/load sessions as JSON. Sessions store: id, plugin, command, agent, messages, tasks, adjudication decisions, timestamps. `--resume <id>` prepends prior messages to loop |
| 3.5 | Session listing | `--sessions` lists sessions sorted by last update. `--sessions --plugin <name>` filters by plugin |
| 3.6 | Task tracking tool | `update_tasks` tool: add, update, complete tasks. Tasks persisted in session JSON |

**Checkpoint:** `bun run src/cli.ts lesson-planning:create-lesson "iteration and loops for class 3B"` produces a lesson plan drawing on workspace context. `--resume <id>` continues the conversation. Sessions are JSON files you can inspect.

---

## Sprint 4 — Hooks, Guardrails, Traces (Day 4–5)

The research infrastructure. This is what makes it a *study* not just a chatbot.

| # | Task | Done when |
|---|---|---|
| 4.1 | Hook framework (`hooks.ts`) | Resolve named hooks from `plugins/*/hooks/`. Hook signature: `(context) => Promise<void>`. Hooks merged: agent-defined first, then caller-provided. All hook executions recorded as trace spans |
| 4.2 | Hook abort mechanism | Any hook can `throw new HookAbortError(name, reason)`. Loop terminates immediately. Trace still written. `LoopResult.status` = `error_hook_abort` with reason |
| 4.3 | Trace logging (`traces.ts`) | Every run produces a trace JSON. Top-level `sessionId`. Spans for: model calls (tokens, cost, stop reason), tool calls (args, results, skill tier), hook executions (pass/abort). Written on completion and on abort |
| 4.4 | `scope-check` hook | preLoop. Rejects out-of-scope requests (UCAS references, report writing, etc.) with clear reason. Simple keyword/pattern heuristic is fine for Phase 1 |
| 4.5 | `age-appropriate` hook | postLoop. Checks output against year group in workspace class profile. Aborts with reason if mismatch |
| 4.6 | `curriculum-evidence` hook | postLoop. Validates any `(curriculum_file:line-range)` evidence pointers in agent output: file exists in workspace, line range valid, quoted text matches. Aborts on invented outcomes |
| 4.7 | `teacher-adjudication` hook | postLoop. Presents Accept / Revise / Generate Alternatives per section. CLI: text prompt. Logs decisions to trace spans with: decision type, section name, timestamp, revision text. This is the core research data |

**Checkpoint:** `bun run src/cli.ts lesson-planning:create-lesson "iteration for 3B"` runs end-to-end with all hooks firing. Trace JSON written to `traces/`. Curriculum evidence guardrail catches a fabricated Es & O. Adjudication decisions appear in the trace.

---

## Sprint 5 — Eval Framework (Day 5–6)

The tool that validates the system and generates development-phase research data.

| # | Task | Done when |
|---|---|---|
| 5.1 | Eval case schema | YAML/JSON case format: `plugin`, `command`, `input`, `workspace` overrides, `criteria[]`. Each criterion has a type: `structural`, `model-judge`, or `behavioural` |
| 5.2 | Structural criteria runner | Checks output for expected sections, class context references, curriculum evidence pointers. Deterministic. Returns pass/fail with reason |
| 5.3 | Behavioural criteria runner | Reads trace file from the eval run. Checks: which skill tiers were loaded, curriculum evidence guardrail outcome, adjudication decisions recorded |
| 5.4 | Model-as-judge criteria runner | Sends output + rubric prompt to a cheap model. Returns 1–5 score with reasoning. Validate against teacher ratings on a calibration set before trusting it |
| 5.5 | Eval report output | Markdown report per run: per-criterion scores, cost, token usage, turn count, trace file link |
| 5.6 | Eval cases (T1, T2, T3) | Cases covering the three scenario types from the product spec. T1: standard lesson (iteration, 3B). T2: differentiation challenge (EAL/ASN). T3: no-existing-resources course. Include structural and behavioural criteria. Establish baseline scores |

**Checkpoint:** `bun run evals/run.ts` runs all three cases, produces a scored markdown report, and you have a baseline to iterate against.

---

## Sprint 6 — Web UI (Day 6–7)

Replaces the CLI for user study sessions. Not polished — just less intimidating than a terminal.

| # | Task | Done when |
|---|---|---|
| 6.1 | Local server (`ui/server.ts`) | Bun HTTP/WebSocket server on localhost. Bridges browser requests to `runAgentLoop()`. No auth |
| 6.2 | Workspace editor sidebar | CodeMirror or Monaco editor. File tree showing workspace markdown files. Save persists to filesystem |
| 6.3 | Chat window | Sends messages to server. Displays agent responses with section structure. Shows loading state |
| 6.4 | Adjudication controls | Accept / Revise / Generate Alternatives buttons inline after each section. Routes through `teacher-adjudication` hook |
| 6.5 | Session management in UI | Resume prior sessions from a session list. New session on page load by default |
| 6.6 | `--serve` CLI flag | `bun run src/cli.ts --serve` starts the web server and opens the browser |

**Checkpoint:** A teacher can sit down, open a browser, see their class profiles on the left, chat on the right, plan a lesson, and adjudicate each section. All decisions are logged to traces. You can run a study session.

---

## Remaining Skills to Seed (parallel to above, Claude Code task)

Once Sprint 2 is done, these can be written by Claude Code against the project:

| Skill | Priority | Notes |
|---|---|---|
| `lesson-structure` | High | Timings guide, starter/main/plenary structure |
| `cognitive-load` | High | Worked examples, split-attention, redundancy |
| `formative-assessment` | Medium | Exit quiz types, hinge questions, live polling |
| `differentiation/eal-strategies` | High | Tier 3 file — vocabulary pre-teaching, visual supports, sentence frames |
| `differentiation/sen-strategies` | High | Tier 3 file — dyslexia, processing speed, ASN scaffolding |
| `backward-design/examples` | Medium | Tier 3 worked examples for Computing Science and History |

---

## What Stays Human-Owned

Don't hand these to Claude Code:

- `src/agent.ts` — the loop is the research artefact
- `src/traces.ts` — the schema is a data contract
- `src/sessions.ts` — same reason
- The teacher-developed rubric (§7.2) — this requires the pre-study workshop

---

---

## Sprint 7 — Subagents (Phase 2, Day 1–2)

Isolated child agents spawned by the planner, returning summaries as tool results. Enables the planner to delegate worksheet and resource creation without bloating its own context.

| # | Task | Done when |
|---|---|---|
| 7.1 | Subagent loop isolation | `runSubagentLoop(agentDef, taskContext, workspacePath)` runs with fresh message history, inherited workspace access, own `maxTurns` (default 10). Cannot spawn further subagents — depth check throws clearly |
| 7.2 | `spawn_subagent` tool (`tools/subagent.ts`) | Tool schema requires: `agent` (name), `task` (string), `context` object with `decisions`, `constraints`, `deliverable`. Spawns isolated loop. Returns `{ summary, output, decisionsLog }` as tool result |
| 7.3 | Subagent trace spans | Parent trace records subagent invocation as a child span with task context provided, token usage, and outcome. Nested under parent span |
| 7.4 | `onSubagentStart` / `onSubagentEnd` hooks | Fire at subagent lifecycle points. Context includes task description and (on end) result summary. Logged to parent trace |
| 7.5 | Subagent budget allocation | Parent passes `maxBudgetUsd` slice to subagent. Subagent terminates with `error_max_budget` if exceeded. Parent receives budget-exceeded status as tool result, not a crash |
| 7.6 | `resource-creator` agent definition | Agent markdown: instructions for worksheet and revision guide creation, workspace refs, skills (lesson-structure, differentiation, formative-assessment), appropriate tool set. No handoffs, no subagent spawning |

**Checkpoint:** `lesson-planning:create-lesson "iteration for 3B"` — planner spawns `resource-creator` for worksheet generation. Worksheet content appears in planner's output. Parent trace shows nested subagent span. Planner's context window does not contain the full worksheet generation conversation.

---

## Sprint 8 — Handoffs (Phase 2, Day 2–3)

Agent-to-agent control transfer with structured context injection. Preserves conversation history — the new agent continues where the previous one left off, with different expertise and tools.

| # | Task | Done when |
|---|---|---|
| 8.1 | Handoff tool generation (`tools/handoff.ts`) | Dynamically generates `transfer_to_<name>` tools from agent's `handoffs` list in frontmatter. Each tool requires structured context parameter: `decisions`, `constraints`, `reason`, `open_questions`. Missing context → tool call fails with clear error |
| 8.2 | Handoff execution in loop | When model calls `transfer_to_<n>`: validate context parameter, inject context block into message history as a structured assistant message, swap active agent definition, reassemble system prompt, resolve new tool set, continue loop with same messages |
| 8.3 | Context block injection | Injected block is formatted as a structured summary in the message history, clearly attributed as a handoff context (not a user message). Incoming agent receives it before its first response |
| 8.4 | `onHandoff` hook | Fires at each transition. Context includes: from-agent name, to-agent name, full handoff context object. Hook can inspect context and abort if it's malformed or violates policy. Logged to trace |
| 8.5 | Unlimited handoff chaining | A → B → C → A is valid. Each transition fires `onHandoff`. No depth limit (unlike subagents). Trace records full chain |
| 8.6 | `differentiation-specialist` agent definition | Agent markdown: deep differentiation expertise, workspace refs, skills (differentiation at Tier 3, cognitive-load, lesson-structure), handoffs back to planner if needed |
| 8.7 | `pedagogy-reviewer` agent definition | Agent markdown: reviews draft lesson plans against backward design and evidence-based pedagogy criteria, workspace refs, skills (backward-design, retrieval-practice, formative-assessment), handoffs to planner with structured feedback |

**Checkpoint:** During a planning session, teacher asks to rethink differentiation. Planner calls `transfer_to_differentiation_specialist` with a context block summarising decisions made so far. Differentiation specialist continues the conversation with full awareness of prior commitments. `onHandoff` span appears in trace. Conversation history is intact — no restart.

---

## Sprint 9 — OpenAI Provider + Comparative Evals (Phase 2, Day 3–4)

Add OpenAI as a second model provider and build the tooling to run ablation studies across providers and agent topologies.

| # | Task | Done when |
|---|---|---|
| 9.1 | OpenAI model adapter (`model.ts` extension) | Implements the same `callModel` interface as the Anthropic adapter. Handles format differences: tool calling schema, tool use/result message format, structured output enforcement. Normalises token counts and cost for trace logging |
| 9.2 | Provider resolution | Agent frontmatter `provider` field routes to the correct adapter. `--provider <n>` CLI flag overrides per run. Provider name recorded in trace metadata |
| 9.3 | Cost normalisation across providers | Trace spans record `provider`, `model`, `inputTokens`, `outputTokens`, `estimatedCostUsd` in a consistent schema regardless of provider. Enables direct cost comparison on identical eval cases |
| 9.4 | Ablation eval cases | Same T1/T2/T3 scenarios from Sprint 5, now run across four configurations: single-agent Anthropic (Phase 1 baseline), single-agent OpenAI, multi-agent Anthropic, multi-agent OpenAI. Cases specify which configuration to run |
| 9.5 | Comparative eval report | Side-by-side scoring: quality scores, cost, token usage, turn count per configuration. Highlights where configurations diverge on specific criteria. Markdown report with trace links |
| 9.6 | Skill tier usage analysis | Behavioural eval criterion: which tiers did the agent load, and did Tier 3 escalation correlate with task complexity (T2 differentiation challenge vs T1 standard)? Derived from trace data |

**Checkpoint:** `bun run evals/run.ts --compare` runs T1 across all four configurations and produces a side-by-side markdown report. You can see cost and quality tradeoffs between providers and between single vs multi-agent on identical inputs.

---

## Sprint 10 — Remaining Skills and Workspace Content (Phase 2, parallel)

These can be written by Claude Code against the project once the eval framework is in place. Run evals after each skill to validate the improvement.

| Skill | Priority | Claude Code prompt hint |
|---|---|---|
| `lesson-structure/timings-guide` | High | "Read the lesson-structure SKILL.md, then write a Tier 3 timings guide covering 50-min and 70-min lesson structures with worked starter/main/plenary timing examples for Scottish secondary" |
| `cognitive-load/worked-examples` | High | "Write a Tier 3 file on worked examples covering: completion problems, faded examples, split-attention effect, and when to use each for Computing Science topics" |
| `formative-assessment/techniques` | Medium | "Write a Tier 3 catalogue of formative assessment techniques suitable for secondary Computing Science: exit tickets, hinge questions, mini-whiteboards, live coding checks" |
| `differentiation/eal-strategies` | High | "Read differentiation/SKILL.md. Write a Tier 3 EAL strategies file covering: vocabulary pre-teaching, sentence frames, visual supports, paired reading, and scaffolded writing frames. Ground in EAL research" |
| `differentiation/sen-strategies` | High | "Read differentiation/SKILL.md. Write a Tier 3 SEN strategies file covering: dyslexia (font, spacing, chunking), processing speed adjustments, ASN scaffolding, and how to differentiate without lowering the academic bar" |
| `backward-design/examples` | Medium | "Write 2 worked examples of the full backward design process: one for TCH 3-13a (iteration, Computing Science) and one for a History topic. Show all three stages with concrete assessment evidence" |
| `cfe-history.md` (workspace curriculum) | Medium | "Extend the workspace curriculum directory with a CfE History curriculum file covering SOC 3-01a through SOC 3-06a, encoding progression relationships and common misconceptions in the same format as cfe-computing.md" |