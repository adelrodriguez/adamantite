# Phase 2: Managed State Reconciliation

## Goal

Build on the phase 1 migration framework by moving the broader "ensure current Adamantite state" logic into reusable migration classes, then use those checks to power a future `adamantite doctor` command.

Phase 2 is about managed state reconciliation, not legacy one-off migrations.

## Why

- Current reconciliation logic is still scattered across command helpers.
- `init` contains several "create if missing, update if present" flows that are really state checks plus corrective actions.
- A future `doctor` command needs reusable checks that can verify the current setup without mutating anything.
- Import migrations from other tooling will fit more cleanly once there is a distinction between legacy migrations and ongoing managed-state migrations.

## Non-Goals

- Do not implement `doctor` in phase 1.
- Do not move the entire `init` command into the migration system.
- Do not rewrite low-level integrations if they already provide useful primitives.
- Do not bundle import migrations from other tooling into this phase unless the framework changes require it.

## Scope

Phase 2 should extract reconciliation logic for the managed resources Adamantite owns today:

- oxlint config
- oxfmt config
- knip config
- TypeScript config
- VS Code settings
- Zed settings
- optionally GitHub Actions workflow once the pattern is proven

These are not all legacy migrations. Some are ongoing "ensure current state" checks.

## Target End State

- The phase 1 `Migration` and `MigrationRunner` abstractions are reused for reconciliation checks.
- A reconciliation migration can answer:
  - not applicable
  - valid
  - needs migration
- `init` can call the same migration classes for selected resources instead of keeping separate branching logic.
- `update` can reuse the same checks for resources that need to be brought up to the current Adamantite-managed state.
- A future `doctor` command can run assessments only and report drift.

## Migration Boundaries

Keep this split:

- `integrations/` own low-level file and tool operations
- `migrations/` own check, migrate, and validate orchestration
- `commands/` own prompts, spinners, and user messaging

Do not move all file parsing and writing logic out of integrations unless the integration API is too coarse for the migration.

## Candidate Reconciliation Migrations

Create one migration per managed resource:

- `ensure-oxlint-config`
- `ensure-oxfmt-config`
- `ensure-knip-config`
- `ensure-typescript-config`
- `ensure-vscode-settings`
- `ensure-zed-settings`

Consider `ensure-github-workflow` later because it depends on package manager and selected scripts, which makes the applicability and validation rules slightly more involved.

## Command Integration Plan

### `init`

Replace command-local branching like:

- "exists -> update"
- "missing -> create"
- "legacy -> migrate"

with targeted reconciliation migration runs for the resources the user selected.

`init` should still remain the orchestration boundary that decides:

- which resources the user wants
- which presets apply
- whether editor extension install should happen
- whether GitHub Actions should be created

### `update`

Use the same reconciliation migrations for resources that Adamantite should keep current after dependency updates.

Legacy migrations from phase 1 and reconciliation migrations from phase 2 should both be selectable by tag.

### `doctor`

Implement later as a read-only consumer of migration assessments:

- run `check`
- collect `warnings`
- report `needs_migration`
- exit non-zero if drift is found

No mutation should happen in `doctor` unless a future `--fix` mode is introduced.

## Suggested File Layout

Keep the flat folder until the migration count proves otherwise:

- `src/lib/migrations/migration.ts`
- `src/lib/migrations/runner.ts`
- `src/lib/migrations/ensure-oxlint-config.ts`
- `src/lib/migrations/ensure-oxfmt-config.ts`
- `src/lib/migrations/ensure-knip-config.ts`
- `src/lib/migrations/ensure-typescript-config.ts`
- `src/lib/migrations/ensure-vscode-settings.ts`
- `src/lib/migrations/ensure-zed-settings.ts`

If the folder grows too much later, split by `adamantite/` and `imports/`.

## Execution Order

1. Prove the phase 1 migration framework inside `update`.
2. Extract one reconciliation migration end to end, preferably `ensure-oxfmt-config` or `ensure-typescript-config`.
3. Refactor `init` to use that migration instead of local branching.
4. Repeat resource by resource.
5. Add `doctor` only after at least a few reconciliation migrations are stable and the reporting shape is clear.

## Risks

- Forcing all `init` logic into migrations may make simple provisioning code harder to read.
- Some resources need additional context beyond `cwd`, such as selected presets or selected scripts.
- GitHub workflow handling may stretch the abstraction if folded in too early.

## Risk Mitigation

- Keep migrations focused on one managed resource each.
- Let commands continue to handle prompting and presentation.
- Expand `MigrationContext` only when a concrete resource needs more data.
- Delay GitHub workflow reconciliation until the config and editor migrations feel clean.

## Acceptance Criteria

- The phase 1 framework can represent both legacy migrations and managed-state reconciliation checks.
- At least one resource currently handled by branching in `init` is represented as a migration class.
- `update` and `init` both reuse the same migration for that resource.
- The path to a future `doctor` command is clear and does not require a second abstraction.
