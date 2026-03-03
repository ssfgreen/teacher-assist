# Sprint 05.5 - UI Alignment Cleanup

## Alignment Status

- Frontend: Planned
- Backend: Planned (prompt formatting guidance only)

## Goal

Consolidate post-3.5 UI direction into a single implementable spec and remove freeform ambiguity.

## Frontend Scope

- Normalize sidebar information architecture (no tab regressions)
- Finalize hover actions, rename/archive affordances, and visual hierarchy
- Maintain markdown-first assistant rendering and inspectable intermediate steps
- Keep full-height layout, editable sidebar width, and bottom-anchored composer behavior

## Backend Scope

- Reinforce markdown-oriented response formatting expectations in system instructions
- No functional API changes

## Shared Contracts

- No route changes
- Preserve existing chat and memory response schemas

## Test and Verification

- Visual regression and interaction tests for sidebar and timeline rows
- Markdown rendering regression checks
