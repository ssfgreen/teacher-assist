# Plan: TypeScript Agent Architecture for teacher-assist

## Context
The project needs a CLI-driven agent system to run teacher workflows (lesson planning, memory updates, etc.).

The workspace already has markdown files describing the teacher's context, classes, and pedagogy.

The goal is a clean TypeScript runtime that reads plugin definitions, assembles context, and calls Anthropic (through the anthropic-sdk-typescript) https://github.com/anthropics/anthropic-sdk-typescript and OpenAI through openai-node https://github.com/openai/openai-node.

Note that the CLI-driven interface is the MVP. As educators are not familiar with programming environments, the future project will have a frontend with login, workspace file editing (using a similar UI to obsidian folder / md editing ) with a space for educators to upload relevant assets. The result is a transparent, editable environment mirroring the agentic claude-code style software engineering for lesson design and creation.

---

## Architecture Overview

Mental model from README is preserved: **skills provide context, commands provide entry points, agents provide execution.** the addition is the **workspace** which provides persistent educator relevant context.

Invocation syntax: `bun src/cli.ts plugin:command "user input"`
- `lesson-planning:create-lesson "recursion for 1B"`
- `update-memory:classes "1B now has 28 students"`

Agents should be able to call these commands themselves. So if during a conversation with a teacher about creating lesson materials for *1B* we discover that the class now has 28 students, then the agent should directly update the workspace and inform the teacher that they are doing this.

**Hooks**

---

## File Structure

```
teacher-assist/
├── src/
│   ├── types.ts        # All interfaces — single source of truth, zero imports
│   ├── model.ts        # callModel() — raw fetch to Anthropic + OpenAI
│   ├── workspace.ts    # loadWorkspace(names) — reads /workspace markdown files
│   ├── plugins.ts      # loadPlugins() — discovers plugins, parses frontmatter
│   ├── agent.ts        # runSingle() / runInteractive() — builds prompt, calls model
│   └── cli.ts          # Entry point: parse "plugin:command input" → run
├── plugins/            # (existing — to be populated with .md definitions)
├── workspace/          # (existing)
├── package.json
├── tsconfig.json
└── .env
```

Six source files. That's it.

---

## Agent/Command Markdown Format

**Agent file** (`plugins/lesson-planning/agents/planner.md`):
```markdown
---
model: claude-sonnet-4-6
provider: anthropic
workspace: [teacher, pedagogy, classes/1B, groups/higher-cs]
skills: [lesson-structure]
---

You are a lesson planning expert...
```

**Command file** (`plugins/lesson-planning/commands/create-lesson.md`):
```markdown
---
agent: planner
description: Creates a full lesson plan from a topic
mode: single
---

The teacher wants a lesson on this topic. Produce a complete, ready-to-teach lesson plan.
```

**Skill file** (`plugins/lesson-planning/skills/lesson-structure.md`):
Plain markdown — no frontmatter. Content is injected directly into system prompt.

**mode**: `single` (default) = one-shot output; `interactive` = readline REPL with history.

---

## Core Interfaces (`src/types.ts`)

```typescript
type ModelProvider = "anthropic" | "openai";
interface Message { role: "user" | "assistant"; content: string; }
interface ModelRequest { provider, model, system, messages, maxTokens? }
interface ModelResponse { content, inputTokens, outputTokens }
interface CommandDef { name, plugin, agent, description, mode, body }
interface AgentDef { name, plugin, model, provider, workspace[], skills[], body }
interface Plugin { name, path, commands[], agents[] }
```

---

## System Prompt Assembly Order (in `agent.ts`)

1. Agent identity + instructions (`agent.body`)
2. Workspace context (assembled from `workspace[]` filenames)
3. Skills (assembled from `skills[]` filenames in `plugin/skills/`)
4. Command-specific framing (`command.body`)

Each section is separated by `---` for readability.

---

## Model Abstraction (`src/model.ts`)

Single `callModel(req: ModelRequest): Promise<ModelResponse>` function.
- Anthropic: POST to `https://api.anthropic.com/v1/messages`, `x-api-key` header, top-level `system` field
- OpenAI: POST to `https://api.openai.com/v1/chat/completions`, `Authorization: Bearer` header, system injected as first message

---

## Frontmatter Parser (`src/plugins.ts`)

Hand-rolled, ~20 lines — no `gray-matter` or `js-yaml` dependency.
Handles: `key: value` and inline arrays `key: [a, b, c]`. That's all we need.

---

## Config Files

**`package.json`**: `{ "scripts": { "start": "bun src/cli.ts" } }`

**`tsconfig.json`**: `target: ESNext, module: ESNext, moduleResolution: bundler, strict: true`

**`.env`**: `ANTHROPIC_API_KEY=...` and `OPENAI_API_KEY=...`
Bun loads `.env` automatically — no dotenv package needed.

---

## update-memory Plugin

For `update-memory:classes "1B now has 28 students"`:
- New plugin at `plugins/update-memory/`
- Agent's instructions tell it to output the full updated file content
- CLI checks for an optional `writes` frontmatter field on the command to know which workspace file to overwrite with the result

---

## Verification

1. `bun src/cli.ts` — should print usage and exit cleanly
2. Populate `plugins/lesson-planning/agents/planner.md` and `commands/create-lesson.md` with valid frontmatter
3. `bun src/cli.ts lesson-planning:create-lesson "recursion for class 1B"` — should assemble context and return a lesson plan
4. `bun src/cli.ts lesson-planning:refine-lesson "recursion"` with `mode: interactive` — should enter REPL
5. Swap `provider: openai` in planner.md, run same command — should hit OpenAI instead

---

## Files to Create

1. `src/types.ts`
2. `src/model.ts`
3. `src/workspace.ts`
4. `src/plugins.ts`
5. `src/agent.ts`
6. `src/cli.ts`
7. `package.json`
8. `tsconfig.json`
9. `.env.example`
10. `plugins/update-memory/` (commands + agents)
11. Seed `plugins/lesson-planning/` with first real agent + command definitions