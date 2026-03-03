# Sprint 07 - Traces Viewer and Full Skills/Curriculum Authoring

## Alignment Status

- Frontend: Planned (reordered from prior frontend Sprint 9)
- Backend: Planned (reordered from prior backend Sprint 9)

## Goal

Make traces first-class for research and debugging, while expanding authored skill/curriculum coverage for reliable command and hook flows.

## Frontend Scope

- Trace viewer entry point from sessions
- Trace timeline with span expansion and filtering
- Trace summary metrics (tokens/cost/tool calls/hooks)
- Research/developer access gating
- Skills panel enhancements for tier visibility and readability

## Backend Scope

- Trace persistence and APIs:
  - `GET /api/traces`
  - `GET /api/traces/:id`
  - `GET /api/sessions/:id/traces`
- Span schema coverage for model/tool/hook/skill/feedforward/reflection/adjudication
- Full pedagogical skill authoring and validation
- Curriculum corpus population and evidence-check compatibility

## Shared Contracts

- Stable trace DTO for frontend rendering and filtering
- Session-to-trace correlation for reopening historical runs
- Skill metadata fields kept consistent between `GET /api/skills` and trace spans

## Test and Verification

- Frontend trace viewer tests (load/filter/expand/summaries)
- Backend trace query and span integrity tests
- Integration tests ensuring hook and skill events appear in traces
