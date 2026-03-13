# Doctor Command

## Goal

Add an `adamantite doctor` command that verifies whether the current project matches Adamantite's expected setup and reports drift without mutating anything.

The command should become the read-only consumer of the migration framework introduced in phase 1 and expanded in phase 2.

## Why

- Users need a way to verify that their project is still correctly configured after manual changes.
- `update` is mutation-oriented. It is not the right surface for "tell me what is wrong" checks.
- The migration framework already introduces reusable `check` logic. `doctor` should consume that instead of inventing another validation system.
- A read-only verification command will also make future import and migration work easier to reason about.

## Non-Goals

- Do not make `doctor` mutate project files in v1.
- Do not add a `--fix` mode in the first iteration.
- Do not block on phase 2 being fully complete if phase 1 checks are already useful.
- Do not duplicate validation logic that already exists in migrations or integrations.

## Scope

The initial command should:

- run migration checks tagged for `doctor`
- surface warnings
- report which migrations are valid, not applicable, or need action
- exit non-zero when drift is detected

Once phase 2 reconciliation migrations exist, `doctor` should cover:

- legacy migration needs
- managed config drift
- editor settings drift where applicable
- optionally workflow drift later

## Target End State

- `src/commands/doctor.ts` exists and is wired into the CLI
- `MigrationRunner.assess(...)` is the source of truth for `doctor`
- migrations opt into `doctor` via tags
- `doctor` produces human-readable output with a clear summary
- exit code is `0` when everything is valid or not applicable
- exit code is `1` when at least one migration reports `needs_migration`

## Suggested Files

- `src/commands/doctor.ts`
- `src/commands/__tests__/doctor.test.ts`

Likely touched:

- `src/index.ts`
- `src/lib/migrations/migration.ts`
- `src/lib/migrations/runner.ts`

## Command Behavior

### High-level flow

1. read `cwd` at the command boundary
2. print the command title/intro
3. run `migrationRunner.assess({ cwd }, ["doctor"])`
4. group results into:
   - valid
   - needs migration
   - not applicable
5. print warnings first
6. print the actionable findings
7. print a final summary
8. exit `1` if there are actionable findings, otherwise `0`

### Reporting Rules

- `warnings` should always be shown
- `needs_migration` should be shown as issues
- `valid` should be shown as healthy checks, or summarized if the output gets noisy
- `not_applicable` should usually be omitted from normal output unless a verbose mode is added later

## Migration Contract Requirements

For `doctor` to work cleanly, the migration check result should support:

- `status`
- `summary`
- optional `warnings`

Recommended statuses:

- `not_applicable`
- `valid`
- `needs_migration`

`doctor` should not call `migrate()` or `validate()` in v1.

## Output Shape

Keep the output compact and actionable.

Suggested structure:

- intro
- warnings
- issues found
- healthy checks summary
- outro

Example:

```text
💠 adamantite doctor

Warnings:
- Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.

Issues:
- Legacy oxlint config needs migration
- Legacy typecheck script needs migration

2 issues found. Run `adamantite update` to reconcile them.
```

## Exit Code Rules

- `0`: no actionable issues
- `1`: at least one actionable issue

If the command itself fails unexpectedly, keep the existing command error handling behavior from the CLI entrypoint.

## Execution Strategy

### Phase A

Ship `doctor` with phase 1 migrations only:

- legacy oxlint config
- legacy typecheck script

This proves the reporting surface early.

### Phase B

Expand coverage as phase 2 reconciliation migrations land:

- ensure oxfmt config
- ensure knip config
- ensure TypeScript config
- ensure VS Code settings
- ensure Zed settings

### Phase C

Evaluate whether a future `doctor --fix` or `doctor --json` mode is worth adding.

Those should be follow-up plans, not part of the first implementation.

## Tests

Add command-level tests for:

- no issues found -> success exit and healthy summary
- one or more migrations need action -> non-zero exit and issue list
- warnings are printed when provided by migration checks
- not-applicable migrations do not create noisy output

If needed, add focused runner tests for assessment grouping behavior rather than pushing all logic into command tests.

## Risks

- noisy output if every valid check is printed individually
- coupling too tightly to the first migration result shape
- implementing `doctor` before enough migrations exist to make it useful

## Risk Mitigation

- keep v1 output concise
- let migrations carry summaries and warnings instead of making the command infer too much
- ship with phase 1 migrations first, then expand incrementally as phase 2 lands

## Acceptance Criteria

- `adamantite doctor` is available as a CLI command
- it uses `MigrationRunner.assess(...)`
- it does not modify project files
- it exits non-zero when actionable drift exists
- it gives users a clear recommendation to run `adamantite update` when appropriate
- command tests cover the main success and failure reporting paths
