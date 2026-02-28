# Frontend Development Plan

Companion to `backend.md`. Each sprint ships frontend and backend together — no capability exists on one side without the other. The frontend is a React + Tailwind CSS + TypeScript application built with Vite, using Zustand for state management and a markdown editor for workspace editing.

---

## Sprint 0 — Project Scaffolding

**Goal:** Frontend project structure, tooling, dev server, and design system foundations ready.

### Deliverables

- [x] Initialise `packages/frontend` with Vite + React + TypeScript
- [x] Tailwind CSS configuration (`tailwind.config.ts`) with project colour palette and typography
- [ ] Component library foundation: decide on ShadCN/ui (customised) or raw Tailwind components
- [x] Base layout shell: responsive container, sidebar + main content area (empty for now)
- [x] Zustand store scaffolding: `useAuthStore`, `useSessionStore` (empty shells)
- [x] API client module (`api/client.ts`): base fetch wrapper with auth header injection, error handling, base URL config
- [ ] TypeScript types shared with backend (import from shared types or duplicate with sync discipline)
- [ ] Storybook or equivalent for isolated component development (optional but recommended)
- [x] Linting and formatting aligned with backend config

### Component Inventory (shells only)

```
src/
├── main.tsx
├── App.tsx
├── api/
│   └── client.ts          # Base HTTP client
├── components/
│   └── layout/
│       └── Shell.tsx       # App shell with sidebar + main area
├── hooks/
│   └── useApi.ts           # Generic fetch hook with loading/error states
├── stores/
│   ├── authStore.ts
│   └── sessionStore.ts
├── types.ts
└── styles/
    └── globals.css         # Tailwind base + custom properties
```

---

## Sprint 1 — Authentication + Basic Chat

**Goal:** Teacher can log in, select a model (Anthropic/OpenAI), send a message, see the response. Sessions are listed and resumable.

### Deliverables

#### Auth UI

- [x] Login page: email + password form, error display, redirect to chat on success
- [x] Auth store (`useAuthStore`): login, logout, current teacher, loading states
- [x] Auth guard: redirect unauthenticated users to login
- [x] API client: automatically attach auth token/cookie to all requests
- [x] Logout button in app header

#### Chat Interface

- [x] `ChatWindow` component: scrollable message list + input area
- [x] Message rendering: user messages (right-aligned or distinct style) and assistant messages (left-aligned, markdown rendered)
- [x] Markdown rendering for assistant responses (use `react-markdown` or similar, with syntax highlighting for code blocks)
- [x] Input area: multi-line text input with send button (Enter to send, Shift+Enter for newline)
- [x] Model selector: dropdown to choose provider (Anthropic/OpenAI) and model (e.g. Claude Sonnet 4, GPT-4o). Persisted in session store.
- [x] Loading state: typing indicator while waiting for response
- [x] Error display: inline error messages if model call fails

#### Session Management

- [x] Session list in sidebar: shows recent sessions with timestamps and first message preview
- [x] Create new session (button or automatic on first message)
- [x] Resume session: click a session → loads messages → continues conversation
- [x] Delete session (with confirmation)
- [x] Session store (`useSessionStore`): current session, session list, create/load/delete operations
- [x] Active session indicator in sidebar

#### API Integration

```typescript
// api/auth.ts
POST /api/auth/login    → { email, password } → token
POST /api/auth/logout
GET  /api/auth/me       → teacher profile

// api/chat.ts
POST /api/chat          → { messages, provider, model, sessionId } → response

// api/sessions.ts
POST /api/sessions      → create
GET  /api/sessions      → list
GET  /api/sessions/:id  → get with messages
PUT  /api/sessions/:id  → append messages
DELETE /api/sessions/:id
```

#### Layout

- [x] App shell: narrow sidebar (sessions list) + main chat area
- [x] Header: app name, model selector, teacher name, logout
- [x] Responsive: sidebar collapsible on small screens

### Component Tree

```
App
├── LoginPage
│   └── LoginForm
└── AuthenticatedLayout
    ├── Header (model selector, user menu)
    ├── Sidebar
    │   └── SessionList
    │       └── SessionItem (clickable, deletable)
    └── MainArea
        └── ChatWindow
            ├── MessageList
            │   └── Message (user | assistant)
            └── ChatInput
```

### Tests

- [x] Auth flow: login → redirect → session created → logout → redirect to login
- [x] Chat flow: type message → send → loading indicator → response rendered
- [x] Session resume: click session → messages loaded → new message sent → appended
- [x] Model selector: change model → next message uses new model
- [x] Error handling: failed login shows error, failed chat shows inline error

#### Sprint 1 Additions Implemented

- [x] Streaming response rendering in chat (incremental assistant message updates via SSE).
- [x] Enter/Shift+Enter hotkey behavior aligned to common LLM chat UX.
- [x] Vite `/api` proxy to backend (`localhost:3001`) for local development.
- [x] Explicit mock model options in selector alongside real provider models.
- [x] Frontend critical-path automated tests with Vitest + React Testing Library.

---

## Sprint 2 — Workspace Editor + Context Awareness

**Goal:** Teachers can view and edit their workspace files (teacher profile, class descriptions, pedagogy preferences, `soul.md`, curriculum references) in a sidebar editor. The chat indicates when workspace context is being used.

### Status (Implemented 2026-02-27)

- [x] Sidebar tabs for `Sessions` and `Workspace`
- [x] Workspace tree rendering with folders/files and pinned visual treatment for `soul.md`
- [x] Workspace file open + edit + save flows (`PUT /api/workspace/*path`)
- [x] Debounced auto-save with manual save control
- [x] File creation and deletion (with `soul.md` deletion blocked)
- [x] Workspace seed action (`POST /api/workspace/seed`)
- [x] Class selector populated from workspace classes and sent as `classRef`
- [x] Context indicator for `workspaceContextLoaded` metadata on chat responses
- [x] Frontend tests for workspace read flow, classRef propagation, and context indicator rendering
- [x] Markdown editor integration (Milkdown-based workspace editing)

### Deliverables

#### Workspace Sidebar

- Sidebar shows stacked sections with **Workspace** above **Sessions**
- Workspace file tree: hierarchical display of workspace files
  - `soul.md` (pinned at top, distinct icon — "Assistant Identity")
  - `teacher.md`
  - `pedagogy.md`
  - `curriculum/` (collapsible folder)
  - `classes/` (collapsible folder)
- File tree icons: folders, markdown files, special icon for `soul.md`
- Click file → opens in editor panel

#### Workspace Editor

- Markdown editor integrated for workspace file editing
- Split-pane layout option: sidebar (file tree) | editor | chat — or sidebar (file tree + editor) | chat
- The editor is a secondary panel that opens when a workspace file is selected, not a replacement for the chat
- Save button + auto-save with debounce (PUT to `/api/workspace/*path`)
- Create new file (within appropriate directories)
- Delete file (with confirmation, `soul.md` protected)
- Seed workspace button for first-time setup (calls `POST /api/workspace/seed`)

#### Workspace Store (`useWorkspaceStore`)

- File tree state (expanded/collapsed folders)
- Currently open file content
- Dirty state tracking (unsaved changes indicator)
- CRUD operations via API

#### Context Indicators in Chat

- When the backend response includes `workspaceContextLoaded` metadata, show a subtle indicator in the chat: "Used: 3B class profile, CfE Computing Science, pedagogy preferences"
- Collapsed by default, expandable to see which files were loaded
- This is the first step toward transparency (product spec §3.5) — teachers can see what context informed the response

#### Updated Chat Input

- Optional class reference selector: dropdown or tag input to specify which class the prompt is about (e.g. "3B"). Populates from workspace `classes/{classRef}/PROFILE.md` directories.
- This sends `classRef` to the backend so the correct class profile and curriculum are loaded

#### Layout Evolution

```
App
├── LoginPage
└── AuthenticatedLayout
    ├── Header
    ├── Sidebar (tabbed: Sessions | Workspace)
    │   ├── SessionList
    │   └── WorkspaceTree
    │       └── FileTreeItem (clickable)
    ├── EditorPanel (conditional, when workspace file selected)
    │   └── WorkspaceEditor
    └── MainArea
        └── ChatWindow
            ├── ContextIndicator (which workspace files loaded)
            ├── MessageList
            └── ChatInput (with class selector)
```

### Tests

- Workspace file tree renders correct structure
- Click file → editor opens with content
- Edit file → save → API called → content persisted
- Create new class file → appears in tree → editable
- Delete file → confirmation → removed from tree
- `soul.md` cannot be deleted
- Seed workspace creates expected files
- Class selector populates from workspace classes
- Context indicator shows when workspace files used in response

---

## Sprint 3 — Tool Use Rendering + Skill Visibility

**Goal:** The chat displays the agent's tool use transparently (which tools called, which skills loaded). Teachers can see the agent "thinking" and working — supporting the transparency principle. Skill loading across tiers is visible.

### Deliverables

#### Tool Use Rendering in Chat

- When the backend returns a message chain with tool calls, render them as collapsible blocks in the chat timeline:
  - **Tool call block:** shows tool name, arguments (formatted), and result (formatted)
  - Default: collapsed with one-line summary (e.g. "Read skill: backward-design")
  - Expandable to show full arguments and result
- Different visual treatment for different tool types:
  - `read_skill` — book/knowledge icon, shows skill name and tier
  - `read_file` / `write_file` — file icon
  - `update_tasks` — checklist icon
  - Generic tool — gear icon
- Tool calls rendered in chronological order within the conversation flow
- Assistant messages that follow tool calls are rendered normally

#### Skill Manifest Display

- In the workspace sidebar (or a dedicated "Skills" tab), show the available skills with their Tier 1 descriptions
- Read-only for MVP — skills are authored by the researcher, not editable by teachers
- When a skill is loaded during a session (Tier 2 or 3), highlight it in the manifest as "active"

#### Enhanced Message Rendering

- Structured output rendering: if the agent produces a lesson plan with clear sections (## Starter, ## Main Activity, ## Plenary, etc.), render with distinct visual sections
- This is preparation for the adjudication UI in Sprint 4 — each section needs to be visually distinct and addressable

#### Updated Chat Store

- Messages now include tool call/result messages in the chain
- Store tracks which skills have been loaded in the current session

### Component Updates

```
ChatWindow
├── ContextIndicator
├── MessageList
│   ├── UserMessage
│   ├── AssistantMessage (with markdown sections)
│   ├── ToolCallBlock (collapsible)
│   │   ├── ToolCallSummary (icon + one-line)
│   │   └── ToolCallDetail (args + result, expandable)
│   └── ... (interleaved in order)
└── ChatInput

Sidebar
├── Sessions tab
├── Workspace tab
└── Skills tab (new)
    └── SkillManifest
        └── SkillItem (name, description, active indicator)
```

### Tests

- Tool call blocks render for `read_skill`, `read_file`, `write_file` tool calls
- Collapsible: default collapsed, click expands
- Skill manifest shows all available skills
- Active skill highlight when skill loaded in session
- Structured assistant message renders with section headings
- Message ordering preserves chronological tool call flow

---

## Sprint 4 — Commands + Interactive Hooks UI

**Goal:** Teachers can invoke named commands. Feedforward, reflection, and adjudication hooks are rendered as interactive UI elements. The full interaction loop — feedforward confirmation → generation → reflection → adjudication — works end to end.

### Deliverables

#### Command Palette / Selector

- Command selector in chat input area: teachers can choose a command (e.g. "Create Lesson", "Refine Lesson") or type freely
- Commands loaded from `GET /api/commands`
- When a command is selected, the chat input may show structured fields (e.g. "Topic: ___", "Class: ___") based on command metadata
- Commands can also be invoked by typing (e.g. `/create-lesson iteration for 3B`)

#### Feedforward Confirmation UI

- When the backend returns `status: 'awaiting_feedforward'`:
  - Display a feedforward card in the chat showing the surfaced context
  - Context shown in readable format: class profile summary, teacher preferences, curriculum, memory notes
  - Three actions: **Confirm** (proceed with all context), **Edit** (modify the context summary), **Dismiss** (proceed without surfaced context)
  - Teacher's choice sent to `POST /api/chat/feedforward-response`
  - After confirmation, chat shows "Context confirmed ✓" indicator and proceeds to generation

#### Reflection Prompt UI

- When the response includes `reflectionPrompts`:
  - Display reflection questions in a distinct card before the adjudication controls
  - Questions are displayed as prompts for thought, not requiring typed answers (though a text field is available)
  - Teacher can acknowledge ("I've considered this") or skip
  - Responses logged via the API

#### Adjudication Controls

- When the backend returns `status: 'awaiting_adjudication'` with sections:
  - Each section of the output (Starter, Main Activity, Plenary, Worksheet, Quiz, Revision Guide) displayed as a distinct card
  - Per section, three buttons: **Accept** ✓, **Revise** ✏️, **Alternatives** ↻
  - **Accept**: marks section as approved, collapses it with green indicator
  - **Revise**: opens inline text field for revision instructions (e.g. "Make this shorter", "Add more scaffolding for EAL"). Sends to `POST /api/chat/adjudication-response` which re-enters the agent loop.
  - **Alternatives**: requests 2–3 variants. Backend returns alternatives, displayed as tabs or stacked cards. Teacher selects one.
  - Bulk actions: "Accept All" button for when the output is good
  - Decisions sent to `POST /api/chat/adjudication-response`

#### Interactive State Management

- Chat flow now has multiple states: `idle`, `loading`, `awaiting_feedforward`, `awaiting_reflection`, `awaiting_adjudication`, `awaiting_memory_capture` (Sprint 6)
- UI adapts based on current state:
  - `loading`: typing indicator, input disabled
  - `awaiting_feedforward`: feedforward card shown, input disabled
  - `awaiting_adjudication`: adjudication controls shown, input disabled
  - Other states: input enabled
- State transitions driven by backend responses

### Component Updates

```
ChatWindow
├── ContextIndicator
├── MessageList
│   ├── UserMessage
│   ├── AssistantMessage
│   ├── ToolCallBlock
│   ├── FeedforwardCard (new — interactive)
│   │   ├── ContextSummary
│   │   └── Actions (Confirm | Edit | Dismiss)
│   ├── ReflectionCard (new — interactive)
│   │   ├── ReflectionQuestions
│   │   └── Actions (Acknowledged | Skip)
│   └── AdjudicationSection (new — per output section)
│       ├── SectionContent (rendered markdown)
│       └── Actions (Accept | Revise | Alternatives)
│           ├── RevisionInput (conditional)
│           └── AlternativesView (conditional, tabbed)
└── ChatInput
    ├── CommandSelector (new)
    ├── ClassSelector
    └── TextInput
```

### Tests

- Command selector loads and displays available commands
- Feedforward card: renders context summary, confirm sends correct API call, edit opens text editor, dismiss proceeds
- Reflection card: renders questions, acknowledge/skip logged
- Adjudication: each section shows three buttons, Accept collapses section, Revise opens input + sends revision, Alternatives shows variants
- State transitions: feedforward → loading → reflection → adjudication → idle
- Bulk accept works
- Revision re-enters loop and shows updated section

---

## Sprint 5 — Traces Viewer + Full Skills Display

**Goal:** A trace viewer for researchers (and optionally teachers) to inspect what happened during a session. Full pedagogical skills visible in the skills tab with tier indicators.

### Deliverables

#### Trace Viewer

- Accessible from session list: each session has a "View Trace" option
- Trace timeline view:
  - Chronological list of spans (model calls, tool calls, hook executions, skill loads)
  - Each span shows: type icon, name, duration, timestamp
  - Expandable to show details (token counts, cost, arguments, results)
- Summary bar: total tokens, total cost, number of tool calls, skills used, hooks triggered
- Filter by span type (model calls only, tool calls only, hooks only)
- This is primarily a research tool — behind a "Developer/Research" toggle or accessible only to researcher accounts

#### Trace API Integration

```typescript
GET /api/traces                  → list traces
GET /api/traces/:id              → full trace with spans
GET /api/sessions/:id/traces     → traces for a session
```

#### Enhanced Skills Tab

- Full skill listing with Tier 1 descriptions
- Grouped by category (pedagogy, curriculum, assessment)
- Each skill shows: name, one-line description, tier indicator (1/2/3 showing what's been loaded in this session)
- Click skill → read-only view of SKILL.md content (Tier 2)
- Useful for teachers to understand what knowledge the system has access to

### Component Updates

```
Sidebar
├── Sessions tab
│   └── SessionItem (now with "View Trace" action)
├── Workspace tab
└── Skills tab
    └── SkillManifest (enhanced)
        └── SkillItem (name, description, tier badge, expandable)

TraceViewer (new — modal or panel)
├── TraceSummary (tokens, cost, duration)
├── TraceTimeline
│   └── TraceSpan (type icon, name, duration)
│       └── SpanDetail (expandable)
└── TraceFilters (by span type)
```

### Tests

- Trace viewer loads and displays spans chronologically
- Span expansion shows correct details
- Filter by type works
- Summary bar shows correct totals
- Skills tab shows all skills with descriptions
- Tier indicators update when skills loaded in session

---

## Sprint 6 — Memory UI

**Goal:** Memory files visible and editable in the workspace sidebar. Memory-capture hook renders as an interactive confirmation UI at session end. Feedforward now shows memory-sourced context with visual distinction.

### Deliverables

#### Memory in Workspace Sidebar

- Memory section in workspace sidebar (separate from workspace files, visually distinct — different icon or section header)
- Tree structure mirrors virtual paths:
  - `MEMORY.md` (teacher-level)
  - `classes/` → `3B/MEMORY.md`, `2C/MEMORY.md`, etc.
  - Topic files under each scope
- Click to view/edit (markdown editor, same as workspace files)
- Changes persist via `PUT /api/memory/*path`
- Delete memory file option

#### Memory-Capture UI

- When backend returns `status: 'awaiting_memory_capture'` with proposals:
  - Display a memory-capture card after adjudication is complete
  - Each proposal shown as a card with:
    - Proposed text (editable inline)
    - Scope badge: "Teacher" or "Class: 3B"
    - Three actions: **Confirm** ✓, **Edit** ✏️ (enables inline editing, then confirm), **Dismiss** ✗
  - Bulk actions: "Confirm All", "Dismiss All"
  - Summary: "3 memories proposed • 2 confirmed • 1 dismissed"
  - Decisions sent to `POST /api/chat/memory-response`

#### Enhanced Feedforward Display

- Feedforward context summary now distinguishes between workspace context and memory context
- Workspace context: normal styling
- Memory context: distinct styling (e.g. lighter background, "From previous sessions:" label)
- Teacher can see what the system has "learned" vs. what they explicitly configured

#### Memory Store (`useMemoryStore`)

- Memory file tree state
- Currently open memory file
- Memory-capture proposals and decisions
- CRUD operations via API

#### Updated State Flow

The full interaction state machine:

```
idle → loading → awaiting_feedforward → loading → awaiting_reflection
→ awaiting_adjudication → awaiting_memory_capture → idle
```

Each `awaiting_*` state has its own UI card and API response handler.

### Component Updates

```
Sidebar
├── Sessions tab
├── Workspace tab
├── Memory tab (new)
│   └── MemoryTree
│       ├── TeacherMemory
│       │   ├── MEMORY.md
│       │   └── topic files...
│       └── ClassMemory
│           ├── 3B/
│           └── 2C/
└── Skills tab

ChatWindow
├── ... (existing)
├── MemoryCaptureCard (new — interactive)
│   └── MemoryProposal (per item)
│       ├── ProposalText (editable)
│       ├── ScopeBadge
│       └── Actions (Confirm | Edit | Dismiss)
└── ChatInput
```

### Tests

- Memory tree renders correct structure
- Click memory file → editor opens with content
- Edit memory file → save → API called
- Memory-capture card: renders proposals, confirm/edit/dismiss per item
- Bulk confirm/dismiss works
- Decisions sent to correct API endpoint
- Feedforward card distinguishes workspace vs. memory context
- State machine transitions correctly through all states

---

## Sprint 7 — Subagent Rendering

**Goal:** When the planner spawns subagents, the frontend shows this delegation transparently. Teachers can see what was delegated, to whom, and the result.

### Deliverables

#### Subagent Delegation Blocks

- When the message chain includes `spawn_subagent` tool calls:
  - Render as a distinct "delegation block" in the chat
  - Header: "Delegated to: Resource Creator" (or whatever subagent name)
  - Task description shown
  - Collapsible body showing the subagent's work (its tool calls and responses)
  - Result summary shown when expanded
  - Default: collapsed with one-line summary
- Visual distinction from regular tool calls (e.g. different colour, nested appearance, agent avatar)

#### Agent Indicator

- Small indicator in the chat showing which agent is currently active
- For Sprint 7 (subagents only): shows "Planner" with occasional "Resource Creator (working...)" when subagent is active
- Prepares for Sprint 8 (handoffs) where the active agent changes for the conversation

#### Updated Trace Viewer

- Subagent spans shown as nested child spans in the trace timeline
- Expandable to show the subagent's own span tree
- Cost rollup: subagent cost shown both individually and in parent total

### Component Updates

```
MessageList
├── ... (existing message types)
└── SubagentBlock (new)
    ├── SubagentHeader (agent name, task, status)
    ├── SubagentBody (collapsible — tool calls, messages)
    └── SubagentResult (summary)

Header
└── AgentIndicator (new — shows current active agent)
```

### Tests

- Subagent block renders when `spawn_subagent` in message chain
- Collapsed by default, expands to show subagent work
- Agent indicator shows correct agent
- Trace viewer shows nested subagent spans
- Cost rollup correct in trace summary

---

## Sprint 8 — Handoff Rendering

**Goal:** When an agent hands off to another, the frontend shows the transition clearly. The chat continues seamlessly but the teacher knows which specialist is now active.

### Deliverables

#### Handoff Transition UI

- When a handoff occurs:
  - Display a transition card in the chat: "Planner → Differentiation Specialist"
  - Show the reason for handoff and key context being passed
  - Collapsible detail showing the full context block
- Agent indicator in header updates to show new active agent
- Chat input area may show a subtle label: "Talking to: Differentiation Specialist"

#### Agent-Aware Message Styling

- Messages from different agents have subtle visual differentiation:
  - Different avatar or icon per agent
  - Agent name label on first message from each agent
  - Consistent colour coding (planner = blue, differentiation = green, etc.)

#### Handoff in Trace Viewer

- Handoff spans shown in trace timeline
- Clear visual: "Agent A → Agent B" with context block viewable
- Post-handoff spans attributed to new agent

### Component Updates

```
MessageList
├── ... (existing)
└── HandoffCard (new)
    ├── TransitionHeader ("Planner → Differentiation Specialist")
    ├── HandoffReason
    └── ContextBlock (collapsible)

Message
└── AgentLabel (shows agent name on first message per agent)

Header
└── AgentIndicator (updates on handoff)
```

### Tests

- Handoff card renders at transition point
- Agent indicator updates to new agent
- Messages after handoff show new agent's label
- Context block viewable in handoff card
- Trace viewer shows handoff spans correctly
- Multiple handoffs (A → B → A) render correctly

---

## Sprint 9+ — Additional Elements

### Sprint 9: Streaming UI

- Token-by-token rendering of assistant responses
- Cursor/typing animation during streaming
- Tool call blocks appear as they're detected in the stream
- Cancel button to abort generation mid-stream
- Smooth scrolling to follow streaming content

### Sprint 10: Document Preview Panel

- Third panel (alongside sidebar and chat): document preview
- Renders generated artefacts (lesson plan, worksheet, revision guide) in a readable, formatted view
- Synced with adjudication: when a section is accepted/revised, the preview updates
- Export options: copy markdown, download as formatted document (stretch: PDF export)
- Print-friendly styling

### Sprint 11: Onboarding Flow

- First-time user experience:
  1. Welcome screen explaining the system
  2. Guided workspace setup: fill in teacher profile template, create first class profile, review/edit `soul.md`
  3. First interaction walkthrough (annotated feedforward → generation → adjudication cycle)
- Template gallery: pre-made class profile templates, pedagogy preference templates
- Time-to-first-value metric: measure time from first login to first usable artefact

### Sprint 12: Research Mode

- Toggle for researcher-specific features:
  - Always-visible trace viewer
  - Condition indicator (which experimental condition is active)
  - Timer display (for timed observation)
  - Think-aloud recording controls
  - Export buttons for session data
- Participant management: researcher can switch between participant accounts
- Data export interface: anonymised sessions, traces, memory events as JSON/CSV

### Sprint 13: Accessibility + Polish

- Keyboard navigation throughout (tab order, shortcuts)
- Screen reader support (ARIA labels, semantic HTML)
- High contrast mode
- Font size controls
- Responsive layout for tablet use (some teachers use iPads)
- Loading skeletons instead of spinners
- Animations for state transitions (subtle, professional)
- Error boundaries with recovery options

### Sprint 14: Teacher Dashboard

- Overview page showing:
  - Sessions per class (usage patterns)
  - Memory growth over time
  - Artefacts created (lesson plans, worksheets)
  - Skill usage frequency
- Not a research dashboard — this is for the teacher to see their own usage and the system's accumulated knowledge

---

## Cross-Cutting Concerns

### State Management Architecture

Zustand stores, each responsible for a clear domain:

| Store | Responsibility |
|-------|----------------|
| `useAuthStore` | Login state, current teacher, token |
| `useSessionStore` | Session list, current session, messages |
| `useChatStore` | Chat state machine (idle/loading/awaiting_*), current response |
| `useWorkspaceStore` | File tree, open file, dirty state |
| `useMemoryStore` | Memory tree, open file, capture proposals |
| `useSkillStore` | Skill manifest, active skills |
| `useTraceStore` | Trace data for viewer |

### API Client Pattern

```typescript
// api/client.ts — base client
const api = {
  get: (path) => fetch(BASE_URL + path, { headers: authHeaders() }),
  post: (path, body) => fetch(BASE_URL + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }),
  put: (path, body) => ...,
  delete: (path) => ...,
};

// api/chat.ts — domain-specific
export const sendMessage = (params) => api.post('/api/chat', params);
export const respondToFeedforward = (params) => api.post('/api/chat/feedforward-response', params);
export const respondToAdjudication = (params) => api.post('/api/chat/adjudication-response', params);
export const respondToMemoryCapture = (params) => api.post('/api/chat/memory-response', params);
```

### Responsive Breakpoints

- Desktop (≥1280px): sidebar + editor + chat (three columns)
- Laptop (≥1024px): sidebar + chat (two columns), editor as overlay/modal
- Tablet (≥768px): collapsible sidebar, full-width chat
- Mobile (≥640px): single column, bottom tabs for navigation (low priority — teachers primarily use desktop/laptop)

### Accessibility Standards

- WCAG 2.1 AA compliance target
- Semantic HTML throughout (no `div` soup)
- All interactive elements keyboard-accessible
- Colour contrast ratios meet AA minimums
- Focus indicators visible
- Screen reader tested on VoiceOver and NVDA

### Performance Targets

- First contentful paint: < 1.5s
- Time to interactive: < 3s
- Message send to first response render: < 500ms (excluding model latency)
- Workspace file save: < 200ms perceived
- Session list load: < 300ms
