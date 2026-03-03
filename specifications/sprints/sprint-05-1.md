# Sprint 05.1 - Preference Memory Extraction Rework

## Alignment Status

- Frontend: Implemented
- Backend: Partially implemented

## Goal

Promote only durable, novel memory with category-aware UX and a silent default path when nothing new is learned.

## Frontend Scope

- Category-grouped proposals: `personal`, `pedagogical`, `class`
- Evidence snippets per proposal
- Silent `no_new_memory` handling (no interruption)
- Category-aware feedforward memory presentation

## Backend Scope

- Structured extraction and novelty gate before proposals
- `status: 'no_new_memory'` when candidates are empty
- Categorized proposal model aligned to UI
- Outstanding: extraction precision/dismissal metrics in traces

## Shared Contracts

- Chat statuses: `success`, `awaiting_memory_capture`, `no_new_memory`
- Proposal payload includes category/scope/evidence fields

## Test and Verification

- Frontend category rendering and silent-path tests
- Backend novelty and categorization tests
- Integration for proposal-confirm-write lifecycle
