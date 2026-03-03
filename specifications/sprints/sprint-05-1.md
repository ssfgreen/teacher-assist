# Sprint 05.1 - Preference Memory Extraction Rework

## Alignment Status

- [x] Frontend: Implemented
- [ ] Backend: Partially implemented

## Goal

Promote only durable, novel memory with category-aware UX and a silent default path when nothing new is learned.

## Frontend Scope

- [x] Category-grouped proposals: `personal`, `pedagogical`, `class`
- [x] Evidence snippets per proposal
- [x] Silent `no_new_memory` handling (no interruption)
- [x] Category-aware feedforward memory presentation

## Backend Scope

- [x] Structured extraction and novelty gate before proposals
- [x] `status: 'no_new_memory'` when candidates are empty
- [x] Categorized proposal model aligned to UI
- [ ] Outstanding: extraction precision/dismissal metrics in traces

## Shared Contracts

- [x] Chat statuses: `success`, `awaiting_memory_capture`, `no_new_memory`
- [x] Proposal payload includes category/scope/evidence fields

## Test and Verification

- [x] Frontend category rendering and silent-path tests
- [x] Backend novelty and categorization tests
- [x] Integration for proposal-confirm-write lifecycle
