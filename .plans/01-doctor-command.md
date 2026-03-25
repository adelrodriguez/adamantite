# Doctor Command

## Goal

Add an `adamantite doctor` command that verifies Adamantite-managed setup in the current project.

Instead of introducing `ensure-*` migrations for steady-state configuration, this plan introduces integration-level `assess(...)` operations. Commands then decide what to do with the reported actions.

## Current State

The current codebase already has reusable migration checks in:

- `src/lib/migrations/base.ts`
- `src/lib/migrations/index.ts`
- `src/lib/migrations/legacy-oxlint-json.ts`
- `src/lib/migrations/legacy-typecheck-script.ts`
- `src/lib/migrations/oxlint-typecheck.ts`

`adamantite update` currently iterates the migration registry directly in:

- `src/commands/update.ts`

The current setup logic for managed resources is still scattered across command-local branches and integration-specific `create(...)` / `update(...)` calls, for example in:

- `src/commands/init.ts`
- `src/lib/integrations/tooling/oxlint.ts`
- `src/lib/integrations/tooling/oxfmt.ts`
- `src/lib/integrations/tooling/knip.ts`
- `src/lib/workspace/typescript-config.ts`
- `src/lib/integrations/editors/vscode.ts`
- `src/lib/integrations/editors/zed.ts`
- `src/lib/integrations/ci/github.ts`

## Why

- The codebase needs one place that can verify ongoing Adamantite-managed state.
- Modeling steady-state setup as per-resource migrations is the wrong abstraction. Those cases are not one-off transitions.
- Each installed Adamantite-managed dependency should be able to report whether its package, version, and config are correct.
- Commands should share one source of truth for what needs to happen, instead of duplicating migration, install, and config-drift checks.

## Non-Goals

- Do not introduce `ensure-*` migration files for steady-state config.
- Do not replace legacy migrations that model one-off transitions.
- Do not make `doctor` install, remove, or upgrade npm packages in v1.
- Do not force every project integration into package semantics if it is not dependency-backed.
- Do not duplicate legacy migration logic inside integration assessment code.

## Architectural Direction

Keep migrations for true transitions only:

- `legacy-oxlint-json`
- `legacy-typecheck-script`
- any future one-time file-format or workflow migrations

Move ongoing setup assessment into the integrations themselves.

Each managed integration should expose an `assess(...)` API that reports the current state and the actions needed to fix it.

Recommended shape:

- `assess(context)` to inspect package, version, config, and related managed state
- optional helper functions inside the integration for config inspection or drift detection
- metadata that lets commands decide whether the integration applies in the current project

The integration host details are covered separately in `.plans/00-define-integration.md`.

Use "integration assessment" as the conceptual model. Commands remain orchestration layers that consume assessments and decide what actions to run.

## Assessment Model

Each applicable integration should be able to report:

- warnings
- healthy / already-valid state
- required actions
- failures to assess automatically

Representative action kinds:

- `install_package`
- `update_package`
- `run_migration`
- `create_config`
- `update_config`
- `manual_fix`

The exact type names can evolve, but the shape should separate:

1. understanding what is wrong
2. deciding which command is allowed to fix it

Legacy migrations remain the source of truth for one-off transitions. Integrations should surface migration needs through assessment results rather than reimplementing migration logic.

## Scope

The initial doctor implementation should introduce assessment flows for the integrations Adamantite already manages today:

- `oxlint`
- `oxfmt`
- `knip`
- `typescriptConfig`
- `vscode`
- `zed`

Consider `github` workflow support after the base pattern is proven, because applicability depends on package manager and selected scripts.

The command should run assessment logic only for integrations that are applicable in the current project. Applicability can be based on signals such as:

- installed dependencies in `package.json`
- managed scripts in `package.json`
- existing managed config files
- explicit Adamantite setup markers where available

## Integration Model

### Dependency-backed integrations

For tooling packages like `oxlint`, `oxfmt`, and `knip`, doctor should determine applicability from installed dependencies plus managed script/config signals, then call `assess(...)` for the integrations that apply.

This supports the desired invariant:

- if a managed dependency is installed, its managed setup should be correct

### Project integrations

Some managed resources are not installed dependencies:

- `typescriptConfig`
- `vscode`
- `zed`
- later `github`

These should still participate through the same assessment shape, but they should be modeled as project integrations rather than forced into package ownership.

### Legacy migrations

Legacy transitions should remain as migrations and stay separate from the assessment API.

For the first implementation, keep the responsibilities split:

- `doctor` assesses steady-state managed setup and reports what is needed
- `doctor --fix` applies only safe local config actions in v1
- `update` remains responsible for package installs, package upgrades, and legacy migrations

This keeps migrations reusable without duplicating their logic inside integrations.

## Command Behavior

### High-Level Flow (`doctor`)

1. read `cwd`
2. print the command title and intro
3. detect applicable integrations
4. run each integration's `assess(...)`
5. collect healthy results, warnings, required actions, and failures
6. print warnings first
7. print healthy integrations and required actions
8. print failures last with actionable next steps
9. exit successfully when all applicable integrations are healthy
10. exit non-zero when any applicable integration requires action or cannot be assessed automatically

### High-Level Flow (`doctor --fix`)

1. run the same assessment flow as `doctor`
2. execute only safe local config actions in v1
3. do not install, remove, or upgrade packages
4. keep legacy migrations as separate reusable operations rather than inlining their logic into integrations
5. re-run assessment after fixes
6. exit successfully only when no actionable issues remain
7. if package or migration actions remain, print actionable next steps, such as running `adamantite update`

### Result Handling

Each integration assessment should be able to communicate at least:

- not applicable
- already valid
- requires action
- failed to assess or fix automatically
- warnings

`doctor` should summarize healthy integrations and required actions separately when useful, but keep output compact.

## Output Shape

Suggested structure:

- intro
- warnings
- healthy integrations
- required actions
- skipped integrations only when helpful
- failures
- outro

Representative example:

```text
💠 adamantite doctor

Warnings:
- Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will prefer `oxlint.config.ts`.

Healthy:
- oxfmt
- tsconfig

Needs attention:
- vscode: create managed settings file
- oxlint: update package `oxlint` from `1.49.0` to `1.57.0`
- legacy oxfmt config: run migration via `adamantite update`

Failed:
- zed: existing settings file could not be reconciled automatically

Run `adamantite doctor --fix` for safe config fixes, or `adamantite update` for dependency and migration work.
```

## Integration Rollout

Start with the simplest existing setup flows and the integrations that already have clear create/update primitives:

1. `oxfmt`
2. `typescriptConfig`
3. `knip`
4. `vscode`
5. `zed`
6. `oxlint`
7. `github` later

`oxlint` should come after the simpler resources because it has the most nuance around legacy config, package/version checks, managed config shape, and type-aware options.

## Files To Add Or Change

Initial command surface:

- `src/commands/doctor.ts`
- `src/commands/__tests__/doctor.test.ts`
- `src/index.ts`

Likely integration files to expand with assessment logic:

- `src/lib/integrations/tooling/oxlint.ts`
- `src/lib/integrations/tooling/oxfmt.ts`
- `src/lib/integrations/tooling/knip.ts`
- `src/lib/workspace/typescript-config.ts`
- `src/lib/integrations/editors/vscode.ts`
- `src/lib/integrations/editors/zed.ts`

Potential shared helper location if needed:

- `src/lib/integrations/...` or `src/lib/shared/...` for assessment result types and command-agnostic helpers

## Testing Plan

Add command coverage in:

- `src/commands/__tests__/doctor.test.ts`

Scenarios:

- no applicable integrations -> success with a compact no-op summary
- applicable integrations already valid -> success with healthy summary
- applicable integrations that need action -> non-zero exit with compact actionable output
- `doctor --fix` applies safe local config actions and re-assesses
- `doctor --fix` reports package and migration actions without executing them
- one integration fails to assess or fix -> non-zero exit and actionable failure output
- warnings are printed before health and action summaries
- doctor does not install or upgrade dependencies

Add focused tests for each integration assessment flow as they are introduced or expanded.

## Risks

- Overloading `doctor` with both recurring verification and broad fix behavior could create confusing behavior.
- Some integrations need more context than "dependency installed", especially CI workflows.
- Applying automatic fixes blindly could overwrite user-managed configurations unless applicability is strict enough.
- Diverging assessment logic from migration logic could reintroduce duplication.

## Risk Mitigation

- Start with integration assessment only and keep command responsibilities explicit.
- Gate applicability carefully using package.json scripts, installed dependencies, and existing config signals.
- Reuse current merge/update behavior so supported user settings are preserved.
- Keep legacy migrations as the single source of truth for one-off transitions.
- Defer GitHub workflow support until the base doctor flow is stable.

## Acceptance Criteria

- `adamantite doctor` exists as a CLI command
- steady-state managed setup is modeled with integration-level `assess(...)` operations, not `ensure-*` migrations
- doctor only runs assessment flows for integrations that apply to the current project
- `adamantite doctor --fix` exists and only applies safe local config actions in v1
- doctor does not install, remove, or upgrade dependencies in v1
- assessment results can express package work, config work, migration work, warnings, and manual fixes
- failures and pending actions surface actionable output and return a non-zero exit through the existing CLI error path
- `update` remains responsible for dependency installs, dependency upgrades, and legacy migrations
- command tests cover the main success, assessment, `--fix`, and failure paths
