# Sprint 09 - Approval Mode (Automation vs FeedForward)

## Alignment Status

- [x] Frontend: Implemented
- [x] Backend: Implemented

## Goal

Introduce an explicit approval-mode toggle that controls how autonomous the agent/subagents are:
- `Automation`: agentic execution with tool use and loop progression until completion.
- `FeedForward` (collaboration mode): user approval gates model-context usage and each external action.

## Frontend Scope

- [x] Approval mode control in chat/session UI with clear active-state indicator
- [ ] Pre-first-call approval prompt:
  - [x] "Use all available context?" decision before first LLM API call
  - [x] Option to proceed with full context or adjust optional context via checkbox selection (required system context remains always-on)
- [ ] Pre-tool-call approval prompt UI:
  - [x] Per-action approve/deny/edit flow (example: reading class file `3B`)
  - [x] "Always approve this class of action" option where safe (scoped allow rules)
- [ ] Pre-skill-read approval prompt UI:
  - [x] Checkbox list of candidate skills the agent proposes to load
  - [x] User can approve subset before skill content is read
- [ ] Event rendering updates so approval requests and user decisions are visible in transcript/thread history

## Backend Scope

- [x] Approval mode persisted on session/run state and propagated to planner + subagents
- [ ] Policy enforcement for `Automation` mode:
  - [x] Agent/subagents may call tools and continue loop autonomously
  - [x] User input can still be requested via interactive hooks when needed
- [ ] Policy enforcement for `FeedForward` mode:
  - [x] Block first model call until context-usage decision is captured
  - [x] Block each tool call until user approval (or matching allow rule) exists
  - [x] Block skill-file reads until user-approved skill subset is captured
- [ ] Subagent inheritance of parent approval mode and approval policy state
- [x] Trace coverage for approval requests, approvals/denials, overrides, and allow-rule applications

## Shared Contracts

- [x] Session/chat payload includes `approvalMode` (`automation` | `feedforward`)
- [ ] New approval event schema for both stream and non-stream responses:
  - [ ] `approval_required`
  - [ ] `approval_response`
  - [ ] `approval_policy_update`
- [x] Deterministic action identifiers so frontend approvals map to exact pending actions
- [x] Allow-rule scope contract (e.g. `read_class_file`, `read_skill_file`) with explicit expiration/lifetime semantics

## Test and Verification

- [x] Frontend tests for mode toggle, approval prompts, and decision persistence in UI state
- [x] Backend unit tests for approval-gating middleware/policy checks
- [ ] Integration tests:
  - [x] `Automation` mode completes agent + subagent tool loops without per-step approvals
  - [x] `FeedForward` mode blocks first model call until context approval
  - [x] `FeedForward` mode blocks tool calls and skill reads until approved
  - [x] Scoped "always approve" rules apply only to intended action classes
- [ ] Regression tests to ensure existing hook flows remain compatible with approval events

## Notes

- Naming: UI may present `FeedForward` as a collaboration-focused mode; wire contract remains explicit and stable.
- Safety default: new sessions should default to `FeedForward` unless product decision changes.
