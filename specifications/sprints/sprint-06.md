# Sprint 06 - Commands and Interactive Hooks

## Alignment Status

- Frontend: Planned (reordered from prior frontend Sprint 8)
- Backend: Planned (reordered from prior backend Sprint 8)

## Goal

Introduce command-driven entry points and interactive hook states that pause/resume the agent loop through explicit frontend actions. This includes both system-initiated interactive hooks (feedforward, reflection, adjudication) and agent-initiated mid-loop questioning via the `ask_user_question` tool.

## Frontend Scope

- Command selector integrated into chat composer
- Feedforward confirmation UI (`confirm`, `edit`, `dismiss`)
- Reflection prompt UI (`acknowledge`, `skip`)
- Adjudication controls (`accept`, `revise`, `alternatives`)
- `AskUserQuestion` UI card — renders inline in the chat (not a modal, to keep context visible). Displays the question with clickable option buttons + optional free-text input when `allow_free_text: true`
- State machine support for:
  - `awaiting_feedforward`
  - `awaiting_reflection`
  - `awaiting_adjudication`
  - `awaiting_user_question`
  - existing memory states

## Backend Scope

- Command discovery and routing (`GET /api/commands`)
- Hook infrastructure across lifecycle points (`preLoop`, `postLoop`, `preModel`, `postModel`, `preTool`, `postTool`)
- Interactive hook pause/resume APIs:
  - `POST /api/chat/feedforward-response`
  - `POST /api/chat/adjudication-response`
  - `POST /api/chat/question-response` — resumes the loop with the teacher's answer injected as a tool result
- `ask_user_question` tool registered in the planner agent's tool set
  - Schema: `question: string`, `options: string[]` (optional), `allow_free_text: boolean`
  - When called, emits a pause event (`awaiting_user_question`) and blocks the loop until a response arrives via `POST /api/chat/question-response`
  - Tool is particularly prompted during command invocation (e.g. when `create-lesson` is called with ambiguous context) — example uses: clarifying which class is intended, choosing between differentiation strategies, deciding whether to build on an existing session or start fresh
- Chat status extensions for interactive hook flow

## Shared Contracts

- Extend chat status enum beyond memory-only states, including `awaiting_user_question`
- Add structured payloads for feedforward, reflection prompts, adjudication sections, and user questions:
  - `QuestionPayload`: `{ question: string, options?: string[], allow_free_text: boolean }`
- Ensure streamed and non-streamed responses carry equivalent interaction state

## Test and Verification

- Frontend tests for command selector, hook cards, and `AskUserQuestion` card (options rendered, free-text input conditionally shown)
- Backend tests for command routing, hook lifecycle, abort behaviour, and `ask_user_question` tool schema and registration
- Integration tests for:
  - Full feedforward → generation → reflection → adjudication loop
  - Agent calls `ask_user_question` → loop pauses → response submitted → loop resumes with answer injected as tool result
  - Options passed through correctly and free-text responses handled

## Notes

The `ask_user_question` tool is agent-initiated and mid-loop, which makes it distinct from the feedforward hook (system-initiated, preLoop). Monitor whether the planner over- or under-uses it during evals and tune the prompt accordingly — what works well for one model may not for another.