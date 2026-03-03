# Sprint 02 - Workspace Editor and Context Awareness

## Alignment Status

- [x] Frontend: Implemented
- [x] Backend: Implemented

## Goal

Workspace files become teacher-editable and context-aware chat becomes transparent.

## Frontend Scope

- [x] Workspace tree in sidebar with file/folder CRUD and rename
- [x] Markdown editor with autosave + manual save
- [x] Workspace reset with confirm and one-step undo
- [x] Class selector populated from workspace classes
- [x] Context-used indicator in chat

## Backend Scope

- [x] Workspace storage in PostgreSQL (`workspace_files`)
- [x] Workspace seed/reset/read/write/delete APIs
- [x] Prompt assembly includes workspace context in defined order
- [x] Class reference extraction and class-targeted loading guidance

## Shared Contracts

- [x] `GET /api/workspace`
- [x] `GET /api/workspace/*path`
- [x] `PUT /api/workspace/*path`
- [x] `DELETE /api/workspace/*path`
- [x] `POST /api/workspace/reset`

## Test and Verification

- [x] Workspace CRUD integration tests
- [x] Frontend workspace tree/editor/class selector tests
- [x] Prompt context ordering and class-context loading tests
