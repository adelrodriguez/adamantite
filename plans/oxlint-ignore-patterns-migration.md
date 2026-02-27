# Oxlint Ignore Patterns Migration Plan

## Goal

Move `ignorePatterns` ownership from Adamantite lint presets to each consumer's local `oxlint.config.ts`.

This keeps presets focused on rules while letting each project explicitly choose ignore behavior during `adamantite init`.

## Scope

- Remove `ignorePatterns` from all lint presets in `presets/lint/*.ts`.
- Add an `init` step that asks whether common ignore patterns should be added to the generated `oxlint.config.ts`.
- Generate ignore patterns based on selected presets.

## Proposed `init` UX

After preset selection, ask:

`Would you like to add recommended ignore patterns to oxlint.config.ts?`

- `Yes` (default): include recommended ignore patterns.
- `No`: do not add `ignorePatterns`.

## Ignore Pattern Strategy

### Base patterns (when user selects "Yes")

- `**/node_modules`
- `**/.git`
- `**/dist`
- `**/build`

### Preset-specific additions

- `nextjs` -> `**/.next`, `**/.vercel`
- `jest` or `vitest` -> `**/coverage`

No extra patterns for `react`, `vue`, or `node` in v1 of this change.

## Implementation Steps

1. **Preset cleanup**
   - Remove `ignorePatterns` from `presets/lint/core.ts`.

2. **Ignore recommendation helper**
   - Add helper in `src/helpers/packages/oxlint.ts` to compute recommended patterns from selected presets.
   - Ensure helper deduplicates and keeps stable ordering.

3. **Config generation support**
   - Extend oxlint config writer to optionally include `ignorePatterns` in generated `oxlint.config.ts`.

4. **Init flow update**
   - In `src/commands/init.ts`, add confirmation prompt for recommended ignores.
   - Pass selected presets + user choice into oxlint config creation.

5. **Tests**
   - Update integration tests for oxlint config creation in `__tests__/helpers.integration.test.ts`.
   - Add init command test coverage in `__tests__/commands.test.ts` for both outcomes:
     - includes ignores when accepted
     - omits ignores when declined
   - Remove assumptions in tests that ignores come from presets.

6. **Docs**
   - Update `README.md` to explain that ignores are optionally scaffolded into local config during init.

## Acceptance Criteria

- Presets contain no `ignorePatterns`.
- `adamantite init` asks whether to add recommended ignore patterns.
- Generated `oxlint.config.ts` includes expected ignore patterns only when user opts in.
- Patterns vary by selected presets as defined above.
- Full project checks pass: `bun run format`, `bun run check`, `bun run typecheck`, `bun run test`.
