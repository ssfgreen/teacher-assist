# Sprint 03.5 - Workspace-First Layout Refresh

## Alignment Status

- Frontend: Implemented
- Backend: No planned changes

## Goal

Adopt a full-height, workspace-first interface with lower-friction chat controls and stronger inspection ergonomics.

## Frontend Scope

- Remove top header; use full-height sidebar + main workspace
- Move provider/model/class controls under composer
- Inline send/stop control and auto-resizing composer
- Sidebar bulk folder expand/collapse controls
- Theme token cleanup and layout consistency pass

## Backend Scope

- No endpoint/runtime changes

## Shared Contracts

- Existing chat/session/workspace APIs unchanged

## Test and Verification

- Frontend tests for moved controls and stream stop behavior
- Workspace tree expansion state regression tests
