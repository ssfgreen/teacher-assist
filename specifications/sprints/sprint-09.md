# Sprint 09 - Handoffs

## Alignment Status

- Frontend: Planned (reordered from prior frontend Sprint 7)
- Backend: Planned (reordered from prior backend Sprint 7)

## Goal

Support explicit agent-to-agent handoffs with visible transitions, maintained context continuity, and attributed post-handoff outputs.

## Frontend Scope

- Handoff transition cards in timeline
- Active-agent label updates after handoff
- Agent-aware message attribution styling
- Handoff detail inspection in trace and message views

## Backend Scope

- `transfer_to_{agent_name}` tool generation from agent definitions
- Handoff context block construction and injection
- `onHandoff` lifecycle support and tracing
- Chat response updates with `currentAgent`
- Stream support for `handoff` events

## Shared Contracts

- Extend chat payload with `currentAgent`
- Extend stream event schema with `handoff` payload
- Ensure replay/resume sessions persist active agent context

## Test and Verification

- Frontend tests for transition cards and agent attribution updates
- Backend tests for handoff chain safety and context transfer
- Integration tests for multi-hop handoffs and trace attribution
