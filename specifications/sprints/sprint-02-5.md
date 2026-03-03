# Sprint 02.5 - Frontend Maintainability Refactor

## Alignment Status

- Frontend: Implemented
- Backend: No planned changes

## Goal

Reduce frontend sprawl and make feature behavior easier to evolve without regressions.

## Frontend Scope

- Split `App.tsx` into domain modules
- Extract chat orchestration hook(s)
- Move workspace path/tree helpers to focused utilities
- Split integration tests by domain with shared fixtures

## Backend Scope

- No API/behavior changes
- Must remain contract-compatible with refactored frontend

## Shared Contracts

- Preserve existing routes and response shapes
- Preserve session/chat/workspace behavior parity

## Test and Verification

- Frontend test suite remains green after refactor
- Smoke pass on login/chat/workspace flows
