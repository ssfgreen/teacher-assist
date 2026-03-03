# Sprint 02 - Workspace Editor and Context Awareness

## Alignment Status

- Frontend: Implemented
- Backend: Implemented

## Goal

Workspace files become teacher-editable and context-aware chat becomes transparent.

## Frontend Scope

- Workspace tree in sidebar with file/folder CRUD and rename
- Markdown editor with autosave + manual save
- Workspace reset with confirm and one-step undo
- Class selector populated from workspace classes
- Context-used indicator in chat

## Backend Scope

- Workspace storage in PostgreSQL (`workspace_files`)
- Workspace seed/reset/read/write/delete APIs
- Prompt assembly includes workspace context in defined order
- Class reference extraction and class-targeted loading guidance

## Shared Contracts

- `GET /api/workspace`
- `GET /api/workspace/*path`
- `PUT /api/workspace/*path`
- `DELETE /api/workspace/*path`
- `POST /api/workspace/reset`

## Test and Verification

- Workspace CRUD integration tests
- Frontend workspace tree/editor/class selector tests
- Prompt context ordering and class-context loading tests
