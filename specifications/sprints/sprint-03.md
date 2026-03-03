# Sprint 03 - Tool-Use Transparency and Skills

## Alignment Status

- Frontend: Implemented
- Backend: Implemented

## Goal

Expose the agent loop transparently: tool use, skill loading, and message-chain reasoning are visible and inspectable.

## Frontend Scope

- Unified chronological timeline for user/tool/assistant events
- Collapsible tool-step summaries and detail expansion
- Sidebar skills section with active-skill highlighting
- Inspector panel for skill/context/prompt/raw-response inspection

## Backend Scope

- `runAgentLoop` with safety limits and tool dispatch
- Tool registry and built-in tools (`read_file`, `write_file`, `str_replace`, `list_directory`, `read_skill`, `update_tasks`)
- Tiered skills discovery and loading
- `GET /api/skills` manifest endpoint
- Chat response includes full message chain and loaded-skill metadata

## Shared Contracts

- `POST /api/chat` returns `messages`, `skillsLoaded`, trace metadata
- Tool errors returned in-chain for model recovery

## Test and Verification

- Frontend timeline ordering/rendering tests
- Backend loop/skills/registry tests
- Integration tests for tool-chain chat responses
