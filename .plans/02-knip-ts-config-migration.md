# Knip TS Config Migration

## Goal

Migrate Adamantite's managed Knip configuration from JSON/JSONC files to `knip.config.ts`, following the same overall direction as the `oxfmt.config.ts` migration while matching Knip's own dynamic-config API.

This plan treats the change as a breaking change and includes a first-class migration path for existing users.

## Current State

Adamantite currently treats JSON-based Knip config as the managed format:

- `src/lib/integrations/tooling/knip.ts`
- `src/lib/integrations/tooling/__tests__/knip.test.ts`
- `src/commands/init.ts`
- `src/commands/update.ts`
- `src/commands/__tests__/init.test.ts`

There is no dedicated Knip migration registered in:

- `src/lib/migrations/index.ts`

The published analyze preset is also a JSON artifact today:

- `presets/knip.json`
- `package.json`
- `src/__tests__/package-metadata.test.ts`
- `bunup.config.ts`

The repo itself still uses a JSONC Knip config:

- `knip.jsonc`

Knip v6 already supports TypeScript config files such as `knip.ts` and `knip.config.ts`, and its docs explicitly position TS config as the dynamic, typed option.

Adamantite already has a JSONC-aware parsing helper that can be reused for legacy config migration:

- `src/lib/shared/json.ts`

## Why

- `knip.config.ts` enables typed and dynamic configuration instead of a static JSON blob.
- Knip reserves some capabilities, such as function-valued config and richer dynamic values, for JS/TS config files.
- A TS config lets users compose `adamantite/analyze` instead of copying the preset into their repo.
- Aligning Knip with `oxlint.config.ts` and the planned `oxfmt.config.ts` flow reduces cognitive overhead.
- The current JSON export limits reuse and makes future TS-only Knip features harder to expose cleanly.

## Non-Goals

- Do not redesign the actual Adamantite Knip ruleset as part of this migration.
- Do not change the behavior of the `adamantite analyze` command itself.
- Do not make `package.json#knip` the new Adamantite-managed target in this phase.
- Do not rely on docs alone; the CLI should actively migrate legacy file-based configs.

## Architectural Direction

Make `knip.config.ts` the canonical Adamantite-managed Knip config.

Treat these as legacy inputs:

- `knip.json`
- `knip.jsonc`

Publish the Adamantite analyze preset as a TypeScript module so generated `knip.config.ts` files can import it directly.

Unlike `oxlint` and `oxfmt`, Knip does not use a `defineConfig(...)` helper. The steady-state generated config should therefore use Knip's typed object export pattern.

Recommended steady-state shape for generated project config:

```ts
import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config: KnipConfig = analyze

export default config
```

Recommended migrated shape when a legacy config contains user overrides:

```ts
import type { KnipConfig } from "knip"
import analyze from "adamantite/analyze"

const config: KnipConfig = {
  ...analyze,
  // migrated user overrides
}

export default config
```

## Breaking Change

This is a breaking change in two ways:

- Adamantite-managed Knip config moves from `knip.json(c)` to `knip.config.ts`.
- The published `adamantite/analyze` export changes from a JSON artifact to a JS/TS module export.

The release should be marked accordingly and documented clearly in the changelog and README.

## Migration Strategy

Follow the same high-level model as the oxfmt plan:

1. make the new TS format the only managed target
2. detect legacy config files during `init` and `update`
3. migrate legacy JSON/JSONC into `knip.config.ts`
4. delete the legacy file after successful migration
5. prefer `knip.config.ts` when both modern and legacy configs exist
6. warn when both modern and legacy configs are present

Because legacy configs are JSON/JSONC, the migration output should preserve user overrides by spreading them over `adamantite/analyze` rather than inlining the full preset unless necessary.

The migration should also strip legacy `$schema` fields, since TS config no longer uses them.

## Scope

This plan includes:

- analyze preset source migration from JSON to TS
- managed config file migration from `knip.json(c)` to `knip.config.ts`
- a new update migration for legacy Knip configs
- init behavior aligned with the modern config flow
- package export and build updates
- tests, docs, and repo self-hosting updates

This plan does not include migrating `package.json#knip` users automatically.

## Implementation Plan

### 1. Convert the preset source to TypeScript

Replace `presets/knip.json` with `presets/knip.ts` as the source of truth.

Recommended shape:

```ts
import type { KnipConfig } from "knip"

const config: KnipConfig = {
  // current Adamantite analyze options
}

export default config
```

Update all internal imports that currently use JSON import assertions.

Primary files:

- `presets/knip.ts`
- `src/lib/integrations/tooling/knip.ts`
- `README.md`
- `AGENTS.md`

### 2. Update build and package exports

Mirror the lint preset packaging pattern for the analyze preset.

Update:

- `bunup.config.ts` to build `presets/knip.ts` into `dist/presets/knip.js` with types
- `package.json` exports so `./analyze` points to the built module instead of JSON
- `package.json` build script so only the remaining JSON presets are copied as static assets
- `src/__tests__/package-metadata.test.ts`

If a compatibility alias such as `./analyze.json` is desired later, decide that explicitly. This plan assumes `./analyze` becomes the module export.

### 3. Rework the Knip tooling integration

Refactor `src/lib/integrations/tooling/knip.ts` to mirror the richer modern-config behavior used by `oxlint`.

Add:

- canonical config filename constant: `knip.config.ts`
- legacy filename constants for `knip.json` and `knip.jsonc`
- richer `exists(...)` result with active format, paths, and dual-config detection
- TS config generation helper for `knip.config.ts`

Recommended `exists(...)` result shape:

- `format: "json" | "jsonc" | "ts" | null`
- `hasBoth: boolean`
- `path`
- `tsPath`
- `jsonPath`
- `jsoncPath`

Recommended `create(...)` behavior:

- create `knip.config.ts`
- import `KnipConfig` from `knip`
- import `analyze` from `adamantite/analyze`
- export the typed config object

Recommended `update(...)` behavior:

- return early when TS config already exists
- migrate JSON/JSONC content into `knip.config.ts`
- parse legacy config with the existing JSONC-aware helper
- preserve user overrides by spreading them over `analyze`
- remove `$schema` from migrated output
- delete the legacy config file after successful migration
- prefer TS when both TS and legacy config exist

### 4. Add a dedicated legacy migration

Add a migration file parallel to the existing config migrations:

- `src/lib/migrations/legacy-knip-json.ts`

Recommended responsibilities:

- `check(...)` detects legacy Knip config state
- emits a warning when both `knip.config.ts` and `knip.json(c)` exist
- returns `needs_migration` when legacy config is active
- `migrate(...)` calls `knip.update(...)`
- `validate(...)` confirms `knip.config.ts` is now the active config

Register it in:

- `src/lib/migrations/index.ts`

Migration ordering should put the Knip migration before any future Knip steady-state migrations.

### 5. Make init mirror the modern config flow

Refactor the Knip setup branch in `src/commands/init.ts` so it matches the newer config behavior more closely:

- warn when both modern and legacy configs exist
- migrate legacy config when active
- keep existing `knip.config.ts`
- otherwise create `knip.config.ts`

This should replace the current simpler branch that only updates existing JSON/JSONC config or creates `knip.json`.

### 6. Migrate this repository's own Knip config

Replace the root `knip.jsonc` with `knip.config.ts`.

Preserve the repo-specific values currently present in `knip.jsonc`, such as:

- `entry`
- `rules`
- `ignoreExportsUsedInFile`
- `ignore`

Keep the migrated file as a straightforward object spread over `adamantite/analyze` unless a repo-specific dynamic value is actually needed.

### 7. Expand test coverage

Update and expand tests to cover the new config shape and migration flow.

Primary files:

- `src/lib/integrations/tooling/__tests__/knip.test.ts`
- `src/commands/__tests__/init.test.ts`
- `src/commands/__tests__/update.test.ts`
- `src/lib/migrations/__tests__/legacy-knip-json.test.ts`
- `src/lib/migrations/__tests__/index.test.ts`
- `src/__tests__/package-metadata.test.ts`

Coverage should include:

- `create(...)` writes `knip.config.ts`
- `update(...)` migrates `knip.json`
- `update(...)` migrates `knip.jsonc`
- `exists(...)` prefers TS config when both TS and legacy files exist
- dual-config warnings during `init` and `update`
- deletion of legacy config after successful migration
- preservation of user overrides in migrated output
- package export metadata for the new analyze preset module

### 8. Update docs and migration guidance

Update docs to describe the new managed Knip config shape and migration path.

Primary files:

- `README.md`
- `CHANGELOG.md`
- `AGENTS.md`

Document:

- the new canonical config filename: `knip.config.ts`
- that existing `knip.json(c)` users should run `adamantite update`
- that `adamantite/analyze` is now intended for module-based composition

## Open Questions

### 1. Should we keep a legacy JSON export alias?

Keeping an explicit `./analyze.json` export could reduce friction for any external consumers that import the raw JSON preset today.

This plan assumes no alias by default, but this is worth deciding before implementation.

### 2. How should Adamantite treat `package.json#knip`?

Knip supports `package.json#knip`, but Adamantite does not currently manage that shape.

Recommended default for this migration:

- do not migrate it automatically
- leave it as a user-managed configuration surface
- optionally warn if it coexists with Adamantite-managed file-based config

### 3. Which typed export style should we standardize on?

There are at least two viable shapes:

```ts
import type { KnipConfig } from "knip"

const config: KnipConfig = {
  /* ... */
}
export default config
```

or

```ts
export default {
  /* ... */
} satisfies import("knip").KnipConfig
```

The first is probably the safer and more familiar generated output.

## Validation

Before merging the migration implementation, verify:

- `knip.config.ts` is created for fresh projects
- legacy `knip.json(c)` files migrate cleanly with `adamantite update`
- `adamantite/analyze` can be imported from generated TS config without resolution issues
- the repo's own `knip.config.ts` works with `bun run analyze`
- quality gates pass with `bun run format`, `bun run test`, `bun run check`, and `bun run analyze`

## Success Criteria

- Adamantite manages `knip.config.ts` as the canonical analyze config
- `adamantite init` creates `knip.config.ts` for fresh projects
- `adamantite update` migrates legacy `knip.json(c)` files to `knip.config.ts`
- the published `adamantite/analyze` preset is consumable as a module from TS config
- docs and tests reflect the new configuration model

## Files To Add Or Change

Expected core changes:

- `presets/knip.ts`
- `package.json`
- `bunup.config.ts`
- `src/lib/integrations/tooling/knip.ts`
- `src/lib/migrations/legacy-knip-json.ts`
- `src/lib/migrations/index.ts`
- `src/commands/init.ts`
- `knip.config.ts`
- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`

Expected test changes:

- `src/lib/integrations/tooling/__tests__/knip.test.ts`
- `src/commands/__tests__/init.test.ts`
- `src/commands/__tests__/update.test.ts`
- `src/lib/migrations/__tests__/legacy-knip-json.test.ts`
- `src/lib/migrations/__tests__/index.test.ts`
- `src/__tests__/package-metadata.test.ts`

Expected removals:

- `presets/knip.json`
- `knip.jsonc`

## Risks

- Importing `adamantite/analyze` from `knip.config.ts` changes the consumer contract from a static JSON preset to a module export.
- Some consumers may rely on `adamantite/analyze` being JSON-importable today.
- Users with both `knip.config.ts` and `knip.json(c)` may have drift between config files.
- Migrating legacy JSON/JSONC into object spread output could accidentally drop unsupported fields if the migration path is too strict.

## Risk Mitigation

- Treat the release as breaking and document the module-export change clearly.
- Provide automatic migration through `adamantite update`.
- Prefer `knip.config.ts` when both config shapes exist and warn clearly about dual-config state.
- Keep migrated output simple and readable: import `adamantite/analyze`, spread user overrides, and strip only `$schema`.
- Add tests for JSON, JSONC, dual-config, package export metadata, and migrated override preservation.
