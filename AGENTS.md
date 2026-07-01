# AGENTS.md

This project was built with [`pastry`](https://github.com/adelrodriguez/pastry) template.

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues at `adelrodriguez/adamantite` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Quality Control

- We use `adamantite` for linting, formatting and type checking.
- Always run `bun run format` after editing files.
- After making changes, run `bun run check` and `bun run test` to ensure the code is still valid.
- After installing or removing dependencies, run `bun run analyze` to ensure we are not using any dependencies that are not needed.

## Changesets

- We use `changesets` for versioning and changelog management.
- Create a changeset only for changes that affect users of the published package, such as CLI behavior, presets, package exports, dependencies used at runtime, or documentation shipped to users.
- Do not add a changeset for internal-only changes, such as tests, CI, release tooling, contributor docs, or repository maintenance that does not affect package users.
- Never make a major version bump unless the user requests it.
- If a breaking change is being made, and we are on v1.0.0 or higher, alert the user.

## Project Overview

For what Adamantite is, its domain vocabulary, the integration lifecycle verbs, and the
codebase map, see `CONTEXT.md`.

## Development Commands

Use Bun for all package management and script execution:

- **Install dependencies**: `bun install`
- **Build CLI**: `bun run build` (uses bunup to bundle `src/index.ts` → `dist/`)
- **Run tests**: `bun test` or `bun run test:watch` for watch mode
- **Code checking**: `bun run check` (checks for issues and type errors)
- **Code fixing**: `bun run fix` (auto-fixes issues and formats code)
- **Code formatting**: `bun run format` (formats code with oxfmt)

## Code Quality Workflow

After editing files, always run:

1. `bun run test` - Run tests to ensure everything works
2. `bun run check` - Check for linting issues and type errors
3. `bun run fix` - Auto-fix issues and format code
4. `bun run format` - Format code explicitly (run after editing various files)

Make sure to always run format after editing files, including creating documentation like changesets and README.md.

## Release Workflow

This project uses changesets for version management:

1. **Create changeset when user-facing**: `bunx changeset` (interactive prompt for version bump)
2. **Version locally**: `bun run version` (bumps package.json and updates CHANGELOG)
3. **Publish**: Push to main → CI passes → auto-publishes to npm

## Code Style

- Prefer function declarations over arrow functions for standalone functions (e.g. `function getImportName(...)` instead of `const getImportName = (...) =>`).
- Keep arrow functions when returning an Effect chain (e.g. `const foo = (args) => Effect.gen(...)`), or when they are callbacks, object methods, or otherwise more pleasant as arrows.
- Format TypeScript suppression comments as `@ts-expect-error - reason` so they fail loudly if the underlying type issue is fixed.
- Prefer `@ts-expect-error - reason` over casts like `as never` when suppressing known third-party type mismatches, so upstream type fixes become visible.

## Architecture

For domain definitions (integration, migration, lifecycle verbs, managed script), the
codebase map, the build pipeline, and the preset files, see `CONTEXT.md`. The rules below
are the guardrails to follow when working in those areas.

### Integration Boundaries

- Integration modules should only export the integration itself (default export). Keep extra helpers out of those files. `src/lib/integrations/base.ts` is the shared infrastructure exception.
- If integration-related logic needs to be reused, move it to a nearby non-integration module such as `src/lib/workspace/**` or `src/lib/shared/**` instead of adding named exports to an integration file.
- Keep one-off transition logic in `src/lib/migrations/**`. Do not move migration behavior into integration files just to simplify command wiring.
- Keep `init` simple. It should not import migration helpers or perform migration-specific orchestration.
- When `init` finds existing setup that it intentionally leaves alone, prefer warning and follow-up guidance over mutation. Point users to `adamantite doctor` / `adamantite doctor --fix` for verification and safe local fixes.

### Integration Lifecycle Invariants

- `assess` is read-only: it must not mutate files or call migrations.
- `doctor --fix` is the only mutating dispatcher; `manual_fix` is report-only.
- Migrations may call integrations to reach the latest supported shape. Integrations must not call migrations.

### Dependency Management

When a tooling dependency's version in `package.json` is higher than the version recorded
in its `src/lib/integrations/tooling/` integration object, update the integration object
to match.
