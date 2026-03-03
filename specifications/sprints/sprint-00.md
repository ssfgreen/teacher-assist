# Sprint 00 - Project Scaffolding

## Alignment Status

- [x] Frontend: Implemented
- [x] Backend: Implemented

## Goal

Establish monorepo foundations, tooling, local runtime, and baseline architecture for authenticated chat and persistent data.

## Frontend Scope

- [x] Vite + React + TypeScript app in `packages/frontend`
- [x] Tailwind setup and raw `components/ui` primitives
- [x] Base shell layout and Zustand store scaffolding
- [x] Shared type import path support
- [x] Linting/formatting and component playground workflow

## Backend Scope

- [x] NestJS app scaffold in `packages/backend`
- [x] PostgreSQL integration, env loading, and migration runner
- [x] Core domain module skeletons (`auth`, `chat`, `sessions`, `workspace`, `skills`, `memory`)
- [x] TypeORM entities and repository wiring

## Shared Contracts

- [x] Shared types package at `packages/shared/types.ts`
- [x] Root scripts for lint/test/dev workflow
- [x] Database-first persistence baseline for teachers/sessions

## Test and Verification

- [x] `bun run lint`
- [x] Backend persistence/config integrity tests
- [x] App boots with local PostgreSQL and seeded demo teacher
