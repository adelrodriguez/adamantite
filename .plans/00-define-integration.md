# Define Integration

## Goal

Replace the narrow `defineTooling(...)` helper with a broader `defineIntegration(...)` helper that can model every doctor participant consistently.

## Why

- `doctor` needs a shared host for tooling packages, workspace files, editor settings, and later CI resources.
- `defineTooling(...)` is too package-centric for `typescriptConfig`, `vscode`, `zed`, and `github`.
- The assessment model should live on the real integration objects, not on command-local abstractions.
- `update` and `init` will be easier to refactor later if they consume one common integration shape.

## Desired End State

- `defineIntegration(...)` is the shared helper for managed integrations.
- `defineTooling(...)` is removed or reduced to a thin compatibility wrapper.
- Tooling, workspace, editor, and CI integrations can all expose `assess(...)` through the same host.
- Commands orchestrate integrations through a shared shape without forcing everything into tooling semantics.

## Proposed Shape

Suggested fields:

- `name`
- `kind`: `tooling` | `workspace` | `editor` | `ci`
- optional `files`
- `applies(context)` or equivalent lightweight applicability check
- `assess(context)`
- optional config helpers such as `create(...)` and `update(...)`

Recommended `assess(...)` responsibilities:

- inspect package presence when relevant
- inspect package version when relevant
- inspect config presence and drift when relevant
- surface migration requirements without reimplementing migration logic
- return warnings, healthy state, required actions, or manual-fix situations

## Design Constraints

- Do not make commands own integration logic.
- Do not duplicate migration implementations inside integrations.
- Do not force non-package resources to pretend they are tooling packages.
- Keep applicability checks cheap so `doctor` can orchestrate multiple integrations safely.

## Migration Path

1. introduce `defineIntegration(...)`
2. keep `defineTooling(...)` working temporarily, either as a wrapper or compatibility layer
3. migrate `oxfmt`, `knip`, and `oxlint`
4. migrate `typescriptConfig`, `vscode`, `zed`, and later `github`
5. remove `defineTooling(...)` once all active integrations use the broader model

## Rollout Order

1. `oxfmt`
2. `typescriptConfig`
3. `knip`
4. `vscode`
5. `zed`
6. `oxlint`
7. `github` later

Start with `oxfmt` because it exercises package checks, version checks, config checks, and later migration signaling without the additional complexity of `oxlint`.

## Files To Add Or Change

- `src/lib/integrations/base.ts` or another neutral integration host location
- `src/lib/integrations/tooling/base.ts`
- `src/lib/integrations/tooling/oxfmt.ts`
- `src/lib/integrations/tooling/knip.ts`
- `src/lib/integrations/tooling/oxlint.ts`
- `src/lib/workspace/typescript-config.ts`
- `src/lib/integrations/editors/vscode.ts`
- `src/lib/integrations/editors/zed.ts`
- later `src/lib/integrations/ci/github.ts`

## Testing Plan

- cover `defineIntegration(...)` with at least one tooling integration and one non-tooling integration
- confirm commands can consume mixed integration kinds without command-specific branching leaks
- keep integration behavior tests focused on public `assess(...)`, `create(...)`, and `update(...)` APIs

## Acceptance Criteria

- `defineIntegration(...)` exists as the primary shared integration helper
- at least one tooling integration and one non-tooling integration use it
- `doctor` can orchestrate mixed integration kinds through the shared helper
- `defineTooling(...)` is either removed or clearly reduced to compatibility-only behavior
