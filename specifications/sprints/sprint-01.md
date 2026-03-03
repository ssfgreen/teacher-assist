# Sprint 01 - Authentication and Basic Chat

## Alignment Status

- Frontend: Implemented
- Backend: Implemented

## Goal

Teachers can log in, create/resume sessions, send chat prompts, and receive responses with provider/model selection.

## Frontend Scope

- Login/logout UI and auth guard
- Session list with create/resume/delete flows
- Chat composer with markdown assistant rendering
- Provider/model/class selector wiring
- Initial streamed response UX and error handling

## Backend Scope

- Auth endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Session CRUD endpoints: `POST/GET/PUT/DELETE /api/sessions*`
- Chat endpoint: `POST /api/chat`
- Provider selection and key-missing validation

## Shared Contracts

- Authenticated cookie-based API access
- Chat payload includes `messages`, `provider`, `model`, optional `sessionId`
- Session ownership isolation per teacher

## Test and Verification

- Frontend auth/chat/session critical path tests
- Backend integration tests for auth guard and session lifecycle
- Provider/model propagation tests across UI and API
