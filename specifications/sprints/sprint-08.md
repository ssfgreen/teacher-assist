# Sprint 08 - Subagents (Foreground-First)

## Alignment Status

- Frontend: Planned (reordered from prior frontend Sprint 6)
- Backend: Planned (reordered from prior backend Sprint 6)

## Goal

Enable planner delegation to specialized subagents with transparent inline rendering, while keeping v1 contracts simple and synchronous.

## Frontend Scope

- Delegation block rendering for `spawn_subagent` events in message chain
- Collapsible subagent detail sections (task, steps, result summary)
- Agent activity indicator embedded in chat layout (not header-dependent)

## Backend Scope

- `spawn_subagent` tool and subagent resolution from `agents/`
- Isolated subagent execution with depth cap and no handoff from subagent
- Trace child spans for subagent invocations and cost rollups
- Planner guidance on when to delegate vs handle directly

## Shared Contracts

- Sprint 08 contract is foreground-first:
  - no new endpoints required
  - delegation is represented through existing chat message-chain + trace payloads
- Background subagent lifecycle/run-id UX is explicitly deferred to a later sprint

## Test and Verification

- Frontend tests for delegation block rendering and expand/collapse behavior
- Backend tests for subagent isolation/depth cap/budget accounting
- Integration tests for planner -> subagent -> planner completion chain
