# Phase 1: Migration Framework

## Goal

Extract the current legacy migration logic into a reusable migration framework and prove it inside `adamantite update`.

Phase 1 is intentionally narrow. It should only cover the legacy migrations that already exist in scattered form today.

## Why

- Migration logic is currently split between command orchestration and low-level integrations.
- `update` already contains migration-specific checks, warnings, and follow-up behavior.
- A migration framework is the prerequisite for a future `doctor` command and for later managed-state reconciliation work.
- Starting with the existing legacy migrations gives us a real vertical slice without overdesigning the system.

## Non-Goals

- Do not implement `doctor` in phase 1.
- Do not move all `init` reconciliation logic into migrations yet.
- Do not create import migrations from other tooling yet.
- Do not rewrite integrations that already provide useful low-level primitives.

## Scope

Phase 1 should only extract these two existing migrations:

- legacy `.oxlintrc.json` -> `oxlint.config.ts`
- legacy `typecheck: "adamantite typecheck"` -> current Adamantite `check` flow

The framework should be general enough to support later phases, but the first integration target should be `update` only.

## Target End State

- `src/lib/migrations/` exists with a base migration class and a migration runner.
- The legacy oxlint config migration is represented as a migration class.
- The legacy typecheck script migration is represented as a migration class.
- `update` consumes the migration runner instead of owning those legacy migration decisions inline.
- Command-level prompting and spinner UX remain in `update`, not inside the migration framework.

## Suggested File Layout

- `src/lib/migrations/migration.ts`
- `src/lib/migrations/runner.ts`
- `src/lib/migrations/legacy-oxlint-json.ts`
- `src/lib/migrations/legacy-typecheck-script.ts`

Do not introduce subfolders yet. The migration count does not justify that structure yet.

## Design

### `Migration`

Use a class-based abstraction.

Each migration should expose:

- `id`
- `title`
- `tags`
- `check(context)`
- `migrate(context)`
- `validate(context)` with a default no-op implementation
- `run(context)` performing `check -> migrate -> validate`

### `MigrationCheckResult`

The check result should distinguish:

- `not_applicable`
- `valid`
- `needs_migration`

It should also support a short summary and optional warnings so `update` and future `doctor` reporting can reuse the same signal.

### `MigrationRunner`

Keep the runner as a plain class, not an Effect service.

The runner should:

- own the migration list on the instance
- filter by tag
- assess migrations
- run applicable migrations

The runner should not own prompting, spinner state, or CLI-specific presentation.

## Migration Boundaries

Keep this split:

- `integrations/` own low-level file and tool operations
- `migrations/` own migration check, migrate, and validate orchestration
- `commands/` own user messaging and progress reporting

This means:

- `oxlint.update(cwd)` can stay as the low-level file rewrite used by a migration
- package.json script rewriting can move into a migration class, with any focused helper extracted if needed
- `update.ts` should stop deciding migration applicability directly once the migration classes exist

## Concrete Migrations

### `legacy-oxlint-json`

Responsibilities:

- `check`: detect whether the active oxlint config is legacy JSON
- `migrate`: call the low-level oxlint migration logic
- `validate`: confirm `oxlint.config.ts` is now the active config

Warnings:

- if both `oxlint.config.ts` and `.oxlintrc.json` exist, the check result should surface a warning for reporting

### `legacy-typecheck-script`

Responsibilities:

- `check`: detect whether `package.json` still uses `typecheck: "adamantite typecheck"`
- `migrate`: rewrite scripts to current Adamantite expectations and ensure the required config state exists
- `validate`: confirm the legacy script is gone and the expected current state exists

This migration may need to:

- update `package.json`
- ensure oxlint config exists or is migrated
- ensure TypeScript config exists or is updated

## `update` Refactor Plan

Refactor `src/commands/update.ts` in place rather than rewriting the command.

Keep:

- dependency version assessment
- dependency install prompt
- spinner UX
- outro decisions

Move out:

- `migrateLegacyTypecheckScript(...)`
- `shouldMigrateLegacyOxlint`
- legacy migration summaries and warnings
- migration applicability decisions for those two legacy cases

Target `update` flow:

1. read cwd and package state
2. assess dependency version updates
3. assess migrations tagged `update`
4. report migration summaries and warnings
5. prompt for dependency updates if needed
6. install updated dependencies if needed
7. run applicable migrations
8. update workflow if needed
9. choose the correct outro

## Tests

Add focused tests for the new migration framework:

- `src/lib/migrations/__tests__/runner.test.ts`
- `src/lib/migrations/__tests__/legacy-oxlint-json.test.ts`
- `src/lib/migrations/__tests__/legacy-typecheck-script.test.ts`

Refactor existing `update` command tests rather than replacing them.

The important behavior to preserve:

- no-op when everything is current
- migrate legacy oxlint config without dependency updates
- migrate legacy typecheck script and ensure current setup
- keep dual-config warning behavior

## Execution Order

1. Add `migration.ts`
2. Add `runner.ts`
3. Add `legacy-oxlint-json.ts`
4. Add `legacy-typecheck-script.ts`
5. Add migration tests
6. Refactor `update.ts` to consume the runner
7. Update `update.test.ts` as needed

## Risks

- Pulling too much `init`-style reconciliation into phase 1
- Letting the migration framework absorb command presentation concerns
- Designing for hypothetical future migration types before the first two migrations are proven

## Risk Mitigation

- Keep phase 1 strictly limited to the two existing legacy migrations
- Leave UI concerns in the command layer
- Reuse low-level integrations instead of rewriting them during the extraction
- Add only the minimum framework needed for `update`

## Acceptance Criteria

- `src/lib/migrations/` exists with a base class and runner
- legacy oxlint migration logic is extracted into a migration class
- legacy typecheck migration logic is extracted into a migration class
- `update` uses the migration runner for those two cases
- existing `update` user-facing behavior remains intact
- `bun run format`, `bun run check`, and `bun run test` pass
- if `typecheck` is restored as a package script, `bun run typecheck` should pass as well
