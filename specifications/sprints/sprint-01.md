# Sprint 01 - Authentication and Basic Chat

## Alignment Status

- [x] Frontend: Implemented
- [x] Backend: Implemented

## Goal

Teachers can log in, create/resume sessions, send chat prompts, and receive responses with provider/model selection.

## Frontend Scope

- [x] Login/logout UI and auth guard
- [x] Session list with create/resume/delete flows
- [x] Chat composer with markdown assistant rendering
- [x] Provider/model/class selector wiring
- [x] Initial streamed response UX and error handling

## Backend Scope

- [x] Auth endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [x] Session CRUD endpoints: `POST/GET/PUT/DELETE /api/sessions*`
- [x] Chat endpoint: `POST /api/chat`
- [x] Provider selection and key-missing validation

## Shared Contracts

- [x] Authenticated cookie-based API access
- [x] Chat payload includes `messages`, `provider`, `model`, optional `sessionId`
- [x] Session ownership isolation per teacher

## Test and Verification

- [x] Frontend auth/chat/session critical path tests
- [x] Backend integration tests for auth guard and session lifecycle
- [x] Provider/model propagation tests across UI and API
