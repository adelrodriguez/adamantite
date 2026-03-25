# Assessment Refactor

## Goal

Refactor `update` and `init` to reuse the shared assessment model introduced by `doctor`, so commands can stay orchestration-only.

## Why

- Once `doctor` introduces integration-level `assess(...)`, other commands should not rediscover state differently.
- Legacy migrations should remain the source of truth for one-off transitions.
- Package checks, version checks, and config drift checks should live with the real integrations they belong to.
- `update` and `init` should consume shared assessments instead of reimplementing checks.

## Desired End State

- `doctor` introduces integration-level `assess(...)` for command-agnostic inspection.
- those assessments are hosted on the broader integration helper described in `.plans/00-define-integration.md`
- Assessments can describe warnings, healthy state, required actions, and manual-fix situations.
- `doctor` and `doctor --fix` are the first consumers of those assessments.
- `update` uses assessments plus existing migrations to run installs, upgrades, and migrations.
- `init` can reuse assessments as a post-setup verifier and to reduce command-local branching.

## Proposed Model

Use a neutral shared type, not a command-specific abstraction.

The integration host details are defined in `.plans/00-define-integration.md`. This plan assumes that broader integration helper already exists.

Suggested shape:

- `assessment.status`: `healthy` | `needs_action` | `manual_fix` | `not_applicable`
- `assessment.warnings`: string[]
- `assessment.actions`: action[]

Commands should usually pre-check applicability before calling `assess(...)`, but integrations may still return `not_applicable` as a safe fallback.

Representative action kinds:

- `install_package`
- `update_package`
- `run_migration`
- `create_config`
- `update_config`
- `manual_fix`

The exact type names can change, but the model should preserve the split between:

1. assessing what is wrong
2. deciding what a command is allowed to do about it

## Scope Boundary

- `doctor` is responsible for introducing the first integration `assess(...)` APIs.
- This plan starts after that foundation exists.
- This plan focuses on teaching `update` and `init` to consume those assessments.

## Command Responsibilities

### doctor

- Already covered by `.plans/01-doctor-command.md`.
- This plan assumes `doctor` is already assessment-driven.

### doctor --fix

- Already covered by `.plans/01-doctor-command.md`.
- This plan assumes `doctor --fix` already consumes shared assessments.

### update

- assess applicable integrations
- execute package installs and upgrades
- execute legacy migrations via the existing migration system
- optionally apply config updates if that becomes useful later

### init

- keep prompts and user choices in the command layer
- use integrations for actual file creation and update behavior
- optionally run assessment after setup to confirm the selected integrations are healthy
- over time, reduce command-local branching by letting integrations describe what setup work is still needed

## Migration Boundary

- Do not duplicate legacy migration logic inside `assess(...)`.
- Integrations should report migration requirements through actions such as `run_migration`.
- Existing migration implementations remain the single source of truth for how migrations run.

## Rollout

After `doctor` establishes the first assessment-driven integration, extend reuse one command at a time.

1. teach `update` to consume `oxfmt` assessments
2. teach `init` to verify `oxfmt` via assessment
3. expand reuse to `typescriptConfig`
4. expand reuse to `knip`
5. expand reuse to `vscode` and `zed`
6. expand reuse to `oxlint`

Start with `oxfmt`, since `doctor` will introduce that first and it validates the model against:

- package presence
- package version correctness
- config presence / drift
- legacy migration requirements

## Files To Add Or Change

- shared assessment types under `src/lib/shared/` or `src/lib/integrations/`
- `src/lib/integrations/tooling/oxfmt.ts`
- `src/lib/workspace/typescript-config.ts`
- `src/lib/integrations/tooling/knip.ts`
- `src/lib/integrations/editors/vscode.ts`
- `src/lib/integrations/editors/zed.ts`
- `src/lib/integrations/tooling/oxlint.ts`
- `src/commands/doctor.ts`
- `src/commands/update.ts`
- `src/commands/init.ts`

## Testing Plan

- integration tests for `oxfmt.assess(...)` remain owned by the doctor work
- command tests proving `update` consumes existing assessment results correctly
- command tests proving `init` can verify selected integrations via shared assessments without duplicating checks
- tests that `update` executes package and migration actions from assessments correctly
- tests that `init` uses assessments for verification rather than command-local checks

## Acceptance Criteria

- at least one integration (`oxfmt`) already exposes `assess(...)` through the doctor work
- `update` can reuse the same assessment source of truth for package and migration work
- `init` can reuse the same assessment source of truth to verify selected setup after creation
- legacy migrations remain implemented in the migration system rather than duplicated in integrations
