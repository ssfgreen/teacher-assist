# Sprint 05 - Memory and Session Search

## Alignment Status

- Frontend: Implemented
- Backend: Implemented

## Goal

Add teacher/class memory with explicit teacher confirmation flow and session search support.

## Frontend Scope

- Sidebar memory tree and memory file editor
- Memory-capture card with confirm/edit/dismiss and bulk actions
- Distinct workspace-context vs memory-context display
- Memory store for file state + proposal decisions

## Backend Scope

- Memory storage and audit events (`memory_files`, `memory_events`)
- Memory APIs (`GET/PUT/DELETE /api/memory/*path`, `GET /api/memory`)
- Memory tools (`read_memory`, `update_memory`)
- Memory-capture decision endpoint (`POST /api/chat/memory-response`)
- Session search (`search_sessions`, `read_session`)

## Shared Contracts

- Chat status may return `awaiting_memory_capture`
- Memory proposals returned in chat payload and resolved via memory-response endpoint

## Test and Verification

- Frontend memory editor/capture interaction tests
- Backend memory isolation/search/prompt-loading tests
- End-to-end confirm-write auditability checks
