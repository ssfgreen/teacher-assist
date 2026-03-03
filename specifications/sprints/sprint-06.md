# Sprint 06 - Commands and Interactive Hooks

## Alignment Status

- [x] Frontend: Complete
- [x] Backend: Complete

## Goal

Introduce command-driven entry points and interactive hook states that pause/resume the agent loop through explicit frontend actions. This includes both system-initiated interactive hooks (feedforward, reflection, adjudication) and agent-initiated mid-loop questioning via the `ask_user_question` tool.

## Frontend Scope

- [x] Command selector integrated into chat composer
- [x] Feedforward confirmation UI (`confirm`, `edit`, `dismiss`)
- [x] Reflection prompt UI (`acknowledge`, `skip`)
- [x] Adjudication controls (`accept`, `revise`, `alternatives`)
- [x] `AskUserQuestion` UI card — renders inline in the chat (not a modal, to keep context visible). Displays the question with clickable option buttons + optional free-text input when `allow_free_text: true`
- [x] State machine support for:
  - [x] `awaiting_feedforward`
  - [x] `awaiting_reflection`
  - [x] `awaiting_adjudication`
  - [x] `awaiting_user_question`
  - [x] existing memory states

## Backend Scope

- [x] Command discovery and routing (`GET /api/commands`)
- [x] Hook infrastructure across lifecycle points (`preLoop`, `postLoop`, `preModel`, `postModel`, `preTool`, `postTool`)
- [x] Interactive hook pause/resume APIs:
  - [x] `POST /api/chat/feedforward-response`
  - [x] `POST /api/chat/adjudication-response`
  - [x] `POST /api/chat/question-response` — resumes the loop with the teacher's answer injected as a tool result
- [x] `ask_user_question` tool registered in the planner agent's tool set
  - [x] Schema: `question: string`, `options: string[]` (optional), `allow_free_text: boolean`
  - [x] When called, emits a pause event (`awaiting_user_question`) and blocks the loop until a response arrives via `POST /api/chat/question-response`
  - [x] Tool is particularly prompted during command invocation (e.g. when `create-lesson` is called with ambiguous context) — example uses: clarifying which class is intended, choosing between differentiation strategies, deciding whether to build on an existing session or start fresh
- [x] Chat status extensions for interactive hook flow

## Shared Contracts

- [x] Extend chat status enum beyond memory-only states, including `awaiting_user_question`
- [x] Add structured payloads for feedforward, reflection prompts, adjudication sections, and user questions:
  - [x] `QuestionPayload`: `{ question: string, options?: string[], allow_free_text: boolean }`
- [x] Ensure streamed and non-streamed responses carry equivalent interaction state

## Test and Verification

- [x] Frontend tests for command selector, hook cards, and `AskUserQuestion` card (options rendered, free-text input conditionally shown)
- [x] Backend tests for command routing, hook lifecycle, abort behaviour, and `ask_user_question` tool schema and registration
- [x] Integration tests for:
  - [x] Full feedforward → generation → reflection → adjudication loop
  - [x] Agent calls `ask_user_question` → loop pauses → response submitted → loop resumes with answer injected as tool result
  - [x] Options passed through correctly and free-text responses handled

## Notes

The `ask_user_question` tool is agent-initiated and mid-loop, which makes it distinct from the feedforward hook (system-initiated, preLoop). Monitor whether the planner over- or under-uses it during evals and tune the prompt accordingly — what works well for one model may not for another.

## Progress Log

- [x] 2026-03-03: Started Sprint 06 with the first vertical slice:
  - [x] Backend: Added authenticated `GET /api/commands`
  - [x] Backend: Added chat request `command` validation and command framing injection into planner instructions
  - [x] Frontend: Added composer command selector and command propagation to `/api/chat`
- [x] 2026-03-03: Completed Sprint 06 scope:
  - [x] Backend: Added hook lifecycle infrastructure (`preLoop`, `postLoop`, `preModel`, `postModel`, `preTool`, `postTool`)
  - [x] Backend: Added pause/resume APIs for feedforward, adjudication/reflection, and ask-user-question
  - [x] Backend: Registered `ask_user_question` tool with schema and loop pause behavior
  - [x] Backend: Added interactive status payloads for feedforward, reflection, adjudication, and question cards
  - [x] Frontend: Added inline cards and state-machine handling for feedforward, reflection, adjudication, and ask-user-question flows
  - [x] Verification: Added/updated backend integration + unit coverage and frontend UI tests for command + interaction flows
