# Oxlint Ignore Patterns Migration

## Goal

Move recommended `ignorePatterns` ownership out of Adamantite's lint presets and into each consumer's local `oxlint.config.ts` generated during `adamantite init`.

This keeps presets focused on rules while making ignore behavior explicit in the consuming project.

## Why

- `ignorePatterns` currently live in `presets/lint/core.ts`, which makes project-specific file exclusions implicit.
- Different projects should be able to see and own the ignore list they are starting from.
- `init` already knows which presets the user selected, so it is the right place to scaffold recommended ignore patterns.

## Scope

- Remove `ignorePatterns` from the Adamantite lint presets.
- Add a helper that computes recommended ignore patterns from the selected presets.
- Extend `oxlint.config.ts` generation so `init` can optionally emit those patterns.
- Ask during `init` whether the generated config should include recommended ignore patterns.
- Update tests and docs to match the new ownership model.

## Non-Goals

- Do not rewrite existing consumer-defined `ignorePatterns` in an existing `oxlint.config.ts`.
- Do not add a separate update-time migration that modifies user-authored ignore lists automatically.
- Do not move unrelated preset behavior out of the lint presets in this change.

## Target End State

- `presets/lint/core.ts` no longer exports `ignorePatterns`.
- `adamantite init` asks whether to include recommended ignore patterns in `oxlint.config.ts`.
- `src/lib/integrations/tooling/oxlint.ts` can compute and serialize optional ignore patterns when creating config files.
- Existing consumer-authored `oxlint.config.ts` files are preserved rather than rewritten just to inject ignore patterns.
- The README explains that ignore patterns are scaffolded into the local config during `init`, not inherited from the preset package.

## Ignore Pattern Strategy

### Base patterns

When the user opts in, always include:

- `**/node_modules`
- `**/.git`
- `**/dist`
- `**/build`

### Preset-specific additions

- `nextjs` adds:
  - `**/.next`
  - `**/.vercel`
- `jest` or `vitest` adds:
  - `**/coverage`

No additional patterns are needed for `react`, `vue`, or `node` in the first version.

## Implementation Details

### Preset Cleanup

Remove `ignorePatterns` from:

- `presets/lint/core.ts`

The presets should remain rule-focused after this change.

### Oxlint Helper Changes

Extend:

- `src/lib/integrations/tooling/oxlint.ts`

Add a helper that:

- accepts the selected preset names
- returns the recommended ignore patterns
- deduplicates values
- preserves stable ordering

Also update the config serializer used by `oxlint.create(...)` so it can optionally emit `ignorePatterns` into the generated `oxlint.config.ts`.

### `init` UX

Update:

- `src/commands/init.ts`

After preset selection and before oxlint config creation or migration, ask:

`Would you like to add recommended ignore patterns to oxlint.config.ts?`

Choices:

- Yes: include recommended ignore patterns
- No: omit `ignorePatterns`

Pass the selected presets and the user's choice into oxlint config creation.

### Existing Config Preservation

If a project already has `oxlint.config.ts`, this change should not rewrite that file just to add or remove ignore patterns.

This plan is about scaffolded defaults for newly generated config and migrated legacy config, not automatic mutation of user-managed ignore lists.

If legacy `.oxlintrc.json` is migrated during `init`, preserve any user-defined ignore configuration that already exists there.

## Files To Update

- `presets/lint/core.ts`
- `src/lib/integrations/tooling/oxlint.ts`
- `src/lib/integrations/tooling/__tests__/oxlint.test.ts`
- `src/commands/init.ts`
- `src/commands/__tests__/init.test.ts`
- `README.md`

## Testing Plan

Update or add coverage in:

- `src/lib/integrations/tooling/__tests__/oxlint.test.ts`
- `src/commands/__tests__/init.test.ts`

Scenarios:

- recommended base ignore patterns are emitted when the user opts in
- preset-specific additions are included for `nextjs`
- preset-specific additions are included for `jest` and `vitest`
- duplicate patterns are removed while preserving deterministic ordering
- `init` omits `ignorePatterns` when the user declines
- existing `oxlint.config.ts` files are left unchanged
- migrated legacy config preserves existing ignore configuration where present

## Documentation

Update `README.md` so the setup section explains:

- `init` can scaffold recommended ignore patterns into `oxlint.config.ts`
- ignore ownership now lives in the consumer project
- presets no longer carry hidden ignore defaults

## Acceptance Criteria

- `presets/lint/core.ts` contains no `ignorePatterns`
- `adamantite init` asks whether to include recommended ignore patterns
- `oxlint.create(...)` and the config serializer support optional `ignorePatterns`
- generated `oxlint.config.ts` includes the expected patterns only when the user opts in
- pattern ordering is stable and duplicates are removed
- existing user-authored `oxlint.config.ts` files are not rewritten solely for this feature
- `bun run format`, `bun run check`, `bun run typecheck`, and `bun run test` pass
