# Sprint 08 - Subagents (Foreground-First)

## Alignment Status

- [x] Frontend: Implemented
- [x] Backend: Implemented

## Goal

Enable planner delegation to specialized subagents with transparent inline rendering, while keeping v1 contracts simple and synchronous.

## Frontend Scope

- [x] Delegation block rendering for `spawn_subagent` events in message chain
- [x] Collapsible subagent detail sections (task, steps, result summary)
- [x] Agent activity indicator embedded in chat layout (not header-dependent)

## Backend Scope

- [x] `spawn_subagent` tool and subagent resolution from `agents/`
- [x] Isolated subagent execution with depth cap and no handoff from subagent
- [x] Trace child spans for subagent invocations and cost rollups
- [x] Planner guidance on when to delegate vs handle directly

## Shared Contracts

- [x] Sprint 08 contract is foreground-first:
  - [x] no new endpoints required
  - [x] delegation is represented through existing chat message-chain + trace payloads
- [x] Background subagent lifecycle/run-id UX is explicitly deferred to a later sprint

## Test and Verification

- [x] Frontend tests for delegation block rendering and expand/collapse behavior
- [x] Backend tests for subagent isolation/depth cap/budget accounting
- [x] Integration tests for planner -> subagent -> planner completion chain

## Notes

- Added `spawn_subagent` handling directly inside agent loop execution (non-stream + stream).
- Added subagent resolver for `agents/*.md` with frontmatter support (`name`, `description`, `model`).
- Added subagent span kind in trace payloads and attached tool metadata for agent/depth/status/usage.
- Added frontend delegation UI card with collapsible `Task`, `Result summary`, and `Steps` sections.
