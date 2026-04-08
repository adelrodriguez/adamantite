# Doctor / Update Boundary

## Goal

Finish the assessment-driven command split around the responsibilities we actually want:

- `update` runs migrations and updates packages
- `doctor` detects and fixes configuration mismatches
- `init` performs setup only and is out of scope for this work

## Descoped

This plan does not include:

- `init` assessment reuse or post-setup verification
- editor integrations (`vscode`, `zed`)
- TypeScript config assessment work

## Desired Command Boundaries

### update

- consume assessment output for package updates and migration requirements
- execute migrations through the migration system
- avoid taking on config repair responsibilities that belong to `doctor`

### doctor

- assess applicable integrations
- report package version mismatches
- report missing packages required by managed scripts
- report config mismatch or unsupported config state
- apply safe fixes for package, config, and migration actions

### init

- keep prompts and setup behavior in the command layer
- leave post-setup correctness checks to `doctor`

## Current State

- `doctor` already consumes integration assessments and can fix package installs, package updates, config creation, and assessment-backed migrations.
- `update` now consumes assessments first, then runs migrations and package updates from that output.
- `update` still contains fallback discovery for package version drift and update-tagged migrations that are not yet represented by integration assessment actions.
- `oxlint-typecheck` still lives as a migration-driven config patch flow rather than a doctor-owned config mismatch fix.

## Remaining Work

### 1. Move oxlint config drift into doctor-owned assessment flow

`doctor` should own config mismatch repair. The remaining major gap is type-aware oxlint config drift.

Target outcome:

- `src/lib/integrations/tooling/oxlint.ts` reports type-aware config drift through assessment output
- unsupported file shapes are reported as manual-fix style assessment output
- `src/commands/doctor.ts` can apply the safe config patch path
- `oxlint-typecheck` stops being the primary way we repair this mismatch

Implementation notes:

- add an assessment action for config patching if needed (`update_config` is the natural fit)
- teach `doctor --fix` how to execute that action for `oxlint`
- preserve the current safe/manual split from `src/lib/migrations/oxlint-typecheck.ts`

### 2. Decide the long-term behavior of update fallback discovery

There are two remaining non-assessment paths in `src/commands/update.ts`:

- fallback package version discovery
- fallback migration `check(...)` discovery

This is not just implementation detail; it defines what `update` means.

#### Recommended default

Keep the broader `update` behavior for now.

That means:

- `update` may continue upgrading known Adamantite tooling packages even when no managed script currently makes an integration assessment-applicable
- `update` may continue running legacy update-tagged migrations discovered through migration checks when they are not yet surfaced through assessments

Why:

- it preserves current tested behavior
- it keeps `update` useful as a project-wide modernization command
- it avoids forcing every remaining legacy transition into the assessment model immediately

#### Optional stricter end state

If we later want `update` to be assessment-only, then we must first:

- remove fallback package discovery only after every supported package update path is represented by assessments
- remove fallback migration discovery only after every update migration is represented by assessment-emitted `run_migration` actions

### 3. Tighten doctor support for config-fix actions

If config patching is moved into assessments, `doctor` should support more than config creation.

Target outcome:

- `doctor --fix` handles `create_config`
- `doctor --fix` handles `update_config`
- `doctor --fix` continues to run assessment-backed migrations where needed
- remaining unsupported states are left as reported manual follow-up work

### 4. Re-scope command tests around the new boundary

We should align tests with the intended split:

- `update` tests should continue proving package upgrades and migration execution
- `doctor` tests should cover wrong package versions, missing packages for managed scripts, missing configs, and patchable config drift
- no new work is needed for `init` in this plan

## Files To Change

- `src/lib/integrations/base.ts`
- `src/lib/integrations/tooling/oxlint.ts`
- `src/commands/doctor.ts`
- optionally `src/commands/update.ts` if we change fallback behavior
- `src/commands/__tests__/doctor.test.ts`
- optionally `src/commands/__tests__/update.test.ts`

## Suggested Sequence

1. extend assessment actions as needed to represent patchable config updates
2. teach `oxlint` assessment to report type-aware config drift and manual-fix cases
3. teach `doctor --fix` to execute config update actions
4. add doctor tests for patchable and manual oxlint config drift
5. decide whether to keep or remove `update` fallback discovery
6. if keeping fallback discovery, document that as intentional and stop there
7. if removing fallback discovery, first move the remaining update migrations behind assessment actions

## Testing Plan

- add doctor tests for patchable `oxlint.config.ts` drift
- add doctor tests for unsupported `oxlint.config.ts` shapes that require manual follow-up
- keep existing update tests passing if we keep broad fallback behavior
- only rewrite update expectations if we explicitly choose the stricter assessment-only meaning of `update`

## Acceptance Criteria

- `doctor` owns repair of package mismatches and config mismatches for supported integrations
- `oxlint` type-aware config drift is no longer primarily handled as an update-only migration concern
- `update` clearly remains either:
  - a broad modernization command with intentional fallback discovery, or
  - a strictly assessment-driven command after fallback discovery is removed
- `init` is not part of this plan
