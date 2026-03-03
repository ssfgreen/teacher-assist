# Sprint 07 - Traces Viewer and Full Skills/Curriculum Authoring

## Alignment Status

- [x] Frontend: Completed
- [x] Backend: Completed

## Goal

Make traces first-class for research and debugging, while expanding authored skill/curriculum coverage for reliable command and hook flows.

## Frontend Scope

- [x] Trace viewer entry point from sessions
- [x] Trace timeline with span expansion and filtering
- [x] Trace summary metrics (tokens/cost/tool calls/hooks)
- [x] Research/developer access gating
- [x] Skills panel enhancements for tier visibility and readability

## Backend Scope

- [x] Trace persistence and APIs:
  - [x] `GET /api/traces`
  - [x] `GET /api/traces/:id`
  - [x] `GET /api/sessions/:id/traces`
- [x] Span schema coverage for model/tool/hook/skill/feedforward/reflection/adjudication
- [x] Full pedagogical skill authoring and validation
- [x] Curriculum corpus population and evidence-check compatibility

## Shared Contracts

- [x] Stable trace DTO for frontend rendering and filtering
- [x] Session-to-trace correlation for reopening historical runs
- [x] Skill metadata fields kept consistent between `GET /api/skills` and trace spans

## Test and Verification

- [x] Frontend trace viewer tests (load/filter/expand/summaries)
- [x] Backend trace query and span integrity tests
- [x] Integration tests ensuring hook and skill events appear in traces

## Delivered Notes

- Added trace-viewer access gating via authenticated teacher access metadata (`access.traceViewer`) and backend allow-list enforcement.
- Added richer trace schema (`spans`, `summary`, `sessionId`) with model/tool/hook/skill/feedforward/reflection/adjudication coverage.
- Added curriculum starter corpus files including `curriculum/evidence-check.md` for evidence-check aligned authoring.
