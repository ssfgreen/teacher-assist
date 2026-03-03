# Sprint 03 - Tool-Use Transparency and Skills

## Alignment Status

- [x] Frontend: Implemented
- [x] Backend: Implemented

## Goal

Expose the agent loop transparently: tool use, skill loading, and message-chain reasoning are visible and inspectable.

## Frontend Scope

- [x] Unified chronological timeline for user/tool/assistant events
- [x] Collapsible tool-step summaries and detail expansion
- [x] Sidebar skills section with active-skill highlighting
- [x] Inspector panel for skill/context/prompt/raw-response inspection

## Backend Scope

- [x] `runAgentLoop` with safety limits and tool dispatch
- [x] Tool registry and built-in tools (`read_file`, `write_file`, `str_replace`, `list_directory`, `read_skill`, `update_tasks`)
- [x] Tiered skills discovery and loading
- [x] `GET /api/skills` manifest endpoint
- [x] Chat response includes full message chain and loaded-skill metadata

## Shared Contracts

- [x] `POST /api/chat` returns `messages`, `skillsLoaded`, trace metadata
- [x] Tool errors returned in-chain for model recovery

## Test and Verification

- [x] Frontend timeline ordering/rendering tests
- [x] Backend loop/skills/registry tests
- [x] Integration tests for tool-chain chat responses
