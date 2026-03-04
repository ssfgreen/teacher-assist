# Unified Sprint Specs

This folder is the canonical sprint plan for cross-stack review.

Each file combines frontend and backend scope for the same sprint, including shared API/state contracts and verification expectations.

## File Order

- `sprint-00.md`
- `sprint-01.md`
- `sprint-02.md`
- `sprint-02-5.md`
- `sprint-02-6.md`
- `sprint-03.md`
- `sprint-03-5.md`
- `sprint-04.md`
- `sprint-05.md`
- `sprint-05-1.md`
- `sprint-05-5.md`
- `sprint-06.md`
- `sprint-07.md`
- `sprint-08.md`
- `sprint-09.md`
- `sprint-10.md`
- `sprint-11.md`
- `sprint-12.md`
- `sprint-13.md`
- `sprint-14.md`
- `sprint-15.md`

## Alignment Notes

- Sprint ordering has been normalized so cross-stack dependencies are respected.
- Previous docs had sprint-order drift in the multi-agent phase. The canonical order is now:
  1. Sprint 06: Commands + Interactive Hooks
  2. Sprint 07: Traces Viewer + Full Skills/Curriculum Authoring
  3. Sprint 08: Subagents
  4. Sprint 09: Approval Mode (Automation vs FeedForward)
  5. Sprint 10: Handoffs
- This remaps older references where subagents/handoffs appeared before commands/hooks.

## Source of Truth

Use this folder for sprint planning and review.
`specifications/frontend.md` and `specifications/backend.md` were removed to avoid duplication; all sprint scope lives only in `specifications/sprints/*.md`.

## Checklist Convention

- Use `- [x]` for completed items.
- Use `- [ ]` for incomplete/planned items.
- Update checklist items in-place as work lands so sprint status remains current.
