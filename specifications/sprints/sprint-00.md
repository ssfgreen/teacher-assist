# Sprint 00 - Project Scaffolding

## Alignment Status

- Frontend: Implemented
- Backend: Implemented

## Goal

Establish monorepo foundations, tooling, local runtime, and baseline architecture for authenticated chat and persistent data.

## Frontend Scope

- Vite + React + TypeScript app in `packages/frontend`
- Tailwind setup and raw `components/ui` primitives
- Base shell layout and Zustand store scaffolding
- Shared type import path support
- Linting/formatting and component playground workflow

## Backend Scope

- NestJS app scaffold in `packages/backend`
- PostgreSQL integration, env loading, and migration runner
- Core domain module skeletons (`auth`, `chat`, `sessions`, `workspace`, `skills`, `memory`)
- TypeORM entities and repository wiring

## Shared Contracts

- Shared types package at `packages/shared/types.ts`
- Root scripts for lint/test/dev workflow
- Database-first persistence baseline for teachers/sessions

## Test and Verification

- `bun run lint`
- Backend persistence/config integrity tests
- App boots with local PostgreSQL and seeded demo teacher
