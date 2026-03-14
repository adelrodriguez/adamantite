# Doctor Command

## Goal

Add an `adamantite doctor` command that makes sure Adamantite-managed integrations are configured correctly in the current project.

Instead of introducing `ensure-*` migrations for steady-state configuration, this plan introduces integration-level `ensure(...)` operations and makes `doctor` the command that runs them.

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

- The codebase needs one place that can reconcile ongoing Adamantite-managed state.
- Modeling steady-state setup as per-resource migrations is the wrong abstraction. Those cases are not one-off transitions.
- Each installed Adamantite-managed dependency should be able to say whether its config is correct and how to fix it.
- A future health command becomes much simpler if it can iterate integrations and ask each one to `ensure(...)` its own state.

## Non-Goals

- Do not introduce `ensure-*` migration files for steady-state config.
- Do not replace legacy migrations that model one-off transitions.
- Do not make `doctor` install or remove npm packages in v1.
- Do not force every project integration into package semantics if it is not dependency-backed.

## Architectural Direction

Keep migrations for true transitions only:

- `legacy-oxlint-json`
- `legacy-typecheck-script`
- any future one-time file-format or workflow migrations

Move ongoing setup correctness into the integrations themselves.

Each managed integration should expose its own reconciliation API, centered on `ensure(...)`.

Recommended shape:

- `check(context)` or equivalent state inspection
- `ensure(context)` to create or update managed files into the correct state
- optional `validate(context)` or postcondition check when needed
- metadata that lets `doctor` decide whether the integration applies in the current project

Use "integration ensure" as the conceptual model, not a CLI subcommand per integration. The repo already uses "command" for top-level CLI entrypoints, so the implementation should stay at the integration API layer.

## Scope

The initial doctor implementation should introduce ensure flows for the integrations Adamantite already manages today:

- `oxlint`
- `oxfmt`
- `knip`
- `typescriptConfig`
- `vscode`
- `zed`

Consider `github` workflow support after the base pattern is proven, because applicability depends on package manager and selected scripts.

The command should run ensure logic only for integrations that are applicable in the current project. Applicability can be based on signals such as:

- installed dependencies in `package.json`
- managed scripts in `package.json`
- existing managed config files
- explicit Adamantite setup markers where available

## Integration Model

### Dependency-backed integrations

For tooling packages like `oxlint`, `oxfmt`, and `knip`, doctor should determine applicability from installed dependencies plus managed script/config signals, then call `ensure(...)` for the integrations that apply.

This supports the desired invariant:

- if a managed dependency is installed, its managed setup should be correct

### Project integrations

Some managed resources are not installed dependencies:

- `typescriptConfig`
- `vscode`
- `zed`
- later `github`

These should still participate through the same shape, but they should be modeled as project integrations rather than forced into package ownership.

### Legacy migrations

Legacy transitions should remain as migrations and stay separate from the ensure API.

For the first implementation, keep the responsibilities split:

- `doctor` runs integration ensures for steady-state managed setup
- `update` continues to run legacy migrations and dependency upgrades

Legacy migration support can be layered into `doctor` later if there is a clear UX for mixing one-off migrations with recurring ensures.

## Command Behavior

### High-Level Flow

1. read `cwd`
2. print the command title and intro
3. detect applicable integrations
4. run each integration's `ensure(...)`
5. collect successes, skips, warnings, and failures
6. print warnings first
7. print which integrations were ensured
8. print failures last with actionable next steps
9. exit successfully when all applicable integrations were ensured or already valid
10. exit non-zero through the existing CLI error pathway when any applicable integration cannot be ensured

### Result Handling

Each integration ensure operation should be able to communicate at least:

- not applicable
- already valid
- changed by ensure
- failed to ensure
- warnings

`doctor` should summarize "already valid" and "changed by ensure" separately when useful, but keep output compact.

## Output Shape

Suggested structure:

- intro
- warnings
- ensured integrations
- skipped integrations only when helpful
- failures
- outro

Representative example:

```text
💠 adamantite doctor

Warnings:
- Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will prefer `oxlint.config.ts`.

Ensured:
- oxfmt
- typescript
- vscode

Failed:
- oxlint: existing config shape could not be reconciled automatically

1 integration failed. Fix the issue above and run `adamantite doctor` again.
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

`oxlint` should come after the simpler resources because it has the most nuance around legacy config, managed config shape, and type-aware options.

## Files To Add Or Change

Initial command surface:

- `src/commands/doctor.ts`
- `src/commands/__tests__/doctor.test.ts`
- `src/index.ts`

Likely integration files to expand with ensure logic:

- `src/lib/integrations/tooling/oxlint.ts`
- `src/lib/integrations/tooling/oxfmt.ts`
- `src/lib/integrations/tooling/knip.ts`
- `src/lib/workspace/typescript-config.ts`
- `src/lib/integrations/editors/vscode.ts`
- `src/lib/integrations/editors/zed.ts`

Potential shared helper location if needed:

- `src/lib/integrations/...` or `src/lib/shared/...` for doctor applicability / orchestration helpers

## Testing Plan

Add command coverage in:

- `src/commands/__tests__/doctor.test.ts`

Scenarios:

- no applicable integrations -> success with a compact no-op summary
- applicable integrations already valid -> success with healthy summary
- applicable integrations are brought into the correct state by `ensure(...)`
- one integration fails to ensure -> non-zero exit and actionable failure output
- warnings are printed before ensure results
- doctor does not install dependencies

Add focused tests for each integration ensure flow as they are introduced or expanded.

## Risks

- Overloading `doctor` with both recurring ensures and legacy migrations could create confusing behavior.
- Some integrations need more context than "dependency installed", especially CI workflows.
- Running ensure operations blindly could overwrite user-managed configurations unless applicability is strict enough.

## Risk Mitigation

- Start with integration ensures only and leave legacy migrations in `update`.
- Gate applicability carefully using package.json scripts, installed dependencies, and existing config signals.
- Reuse current merge/update behavior so supported user settings are preserved.
- Defer GitHub workflow support until the base doctor flow is stable.

## Acceptance Criteria

- `adamantite doctor` exists as a CLI command
- steady-state managed setup is modeled with integration-level `ensure(...)` operations, not `ensure-*` migrations
- doctor only runs ensure flows for integrations that apply to the current project
- doctor does not install or remove dependencies in v1
- successful ensures leave applicable integrations in the expected managed state
- failures surface actionable output and return a non-zero exit through the existing CLI error path
- `update` remains responsible for dependency upgrades and legacy migrations
- command tests cover the main success, ensure, and failure paths
