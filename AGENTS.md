# AGENTS.md

## Product and Development Specs

These live in ./specifications

There are now three top-level spec entry points plus a sprint folder:

- `product-spec.md` which defines the vision for the product
- `dev-spec.md` which is the overall architecture and development ideas (open for tweaking)
- `sprints/` which contains one markdown file per sprint with aligned frontend + backend scope

## Code Quality and Refactoring

- Refactor continuously as you go — do not let files grow unwieldy.
- Write tests before you refactor to ensure that the critical path doesn't break.
- If a file exceeds ~300 lines, proactively split it into smaller, well-named modules with clear responsibilities.
- Extract repeated logic into shared utilities or helpers rather than duplicating code.
- Each module/file should have a single clear purpose. If you find yourself adding unrelated functionality, create a new file.
- When adding features to an existing file, first assess whether the file needs restructuring before adding more code.
- Prefer many small, focused files over few large ones.

## Verification steps

- Tests: Ensure critical path is always tested
- Linters: Always run linting

## Architecture, readme and specifications

- Keep an up-to-date ARCHITECTURE.md explaining the current architecture alongside key reasoning
- Keep an up-to-date README.md, ensure it doesn't duplicate information and remains clear
- Keep an up-to-date CRITICAL_PATHS.md with key user flows and the tests that are ascribed to them
- Keep specifications up to date with what has been done, including tasks that weren't previously in the spec document that were added along the way.
