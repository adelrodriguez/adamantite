# Oxfmt TS Config Migration

## Goal

Migrate Adamantite's managed oxfmt configuration from JSON/JSONC files to `oxfmt.config.ts`, following the same overall path used for `oxlint`.

This plan treats the change as a breaking change and includes a first-class migration path for existing users.

## Current State

Adamantite currently treats JSON-based oxfmt config as the managed format:

- `src/lib/integrations/tooling/oxfmt.ts`
- `src/lib/integrations/tooling/__tests__/oxfmt.test.ts`
- `src/commands/init.ts`
- `src/commands/__tests__/init.test.ts`

The published formatter preset is also a JSON artifact today:

- `presets/format.json`
- `package.json`
- `src/__tests__/package-metadata.test.ts`
- `bunup.config.ts`

The repo itself still uses a JSON formatter config:

- `.oxfmtrc.json`

Unlike `oxlint`, formatter migration support does not yet exist in `update`.

## Why

- `oxfmt.config.ts` enables module composition, which is the closest oxfmt equivalent to oxlint's preset-based `extends` model.
- A TS config makes Adamantite's formatter preset more reusable in ecosystems like Vite+.
- Aligning oxlint and oxfmt around TypeScript config files reduces cognitive overhead for users.
- The current JSON export limits composition and pushes consumers toward copying config instead of reusing it.

## Non-Goals

- Do not try to invent an `extends` field for oxfmt.
- Do not silently preserve the current JSON export as the primary API.
- Do not leave migration behavior to docs only; the CLI should actively migrate legacy configs.

## Architectural Direction

Make `oxfmt.config.ts` the canonical Adamantite-managed formatter config.

Treat these as legacy inputs:

- `.oxfmtrc.json`
- `.oxfmtrc.jsonc`

Publish the Adamantite formatter preset as a TypeScript module, analogous to the lint presets.

Because oxfmt does not support `extends`, composition should happen through module imports and object spread.

Recommended steady-state shape for generated project config:

```ts
import { defineConfig } from "oxfmt"
import format from "adamantite/format"

export default defineConfig(format)
```

Recommended migrated shape when a legacy config contains user overrides:

```ts
import { defineConfig } from "oxfmt"
import format from "adamantite/format"

export default defineConfig({
  ...format,
  // migrated user overrides
})
```

## Breaking Change

This is a breaking change in two ways:

- Adamantite-managed formatter config moves from `.oxfmtrc.json(c)` to `oxfmt.config.ts`.
- The published `adamantite/format` export changes from a JSON artifact to a JS/TS module export.

The release should be marked accordingly and documented clearly in the changelog and README.

## Migration Strategy

Follow the oxlint model:

1. make the new TS format the only managed target
2. detect legacy config files during `init` and `update`
3. migrate legacy JSON/JSONC into `oxfmt.config.ts`
   - parse `.oxfmtrc.jsonc` with a JSONC-aware parser; never use `JSON.parse` for `.jsonc`
4. delete the legacy file after successful migration
5. prefer `oxfmt.config.ts` when both modern and legacy configs exist
6. warn when both modern and legacy configs are present

Unlike oxlint, the migration target should not inline the full preset unless needed. Prefer importing `adamantite/format` and layering user-defined values on top.

## Scope

This plan includes:

- formatter preset source migration from JSON to TS
- managed config file migration from `.oxfmtrc.json(c)` to `oxfmt.config.ts`
- new update migration for legacy formatter configs
- init behavior aligned with oxlint
- package export and build updates
- tests, docs, and repo self-hosting updates

## Implementation Plan

### 1. Convert the preset source to TypeScript

Replace `presets/format.json` with `presets/format.ts` as the source of truth.

Recommended shape:

```ts
import { defineConfig } from "oxfmt"

export default defineConfig({
  // current Adamantite formatter options
})
```

Update all internal imports that currently use JSON import assertions.

Primary files:

- `presets/format.ts`
- `src/lib/integrations/tooling/oxfmt.ts`
- `README.md`
- `AGENTS.md`

### 2. Update build and package exports

Mirror the lint preset packaging pattern for formatter output.

Update:

- `bunup.config.ts` to build `presets/format.ts` into `dist/presets/format.js` with types
- `package.json` exports so `./format` points to the built module instead of JSON
- `package.json` build script so formatter preset output is built correctly
- `src/__tests__/package-metadata.test.ts`

Decide whether to keep a legacy compatibility alias such as `./format.json` only if explicitly desired later. This plan assumes the breaking change is intentional and `./format` becomes the module export.

### 3. Rework the oxfmt tooling integration

Refactor `src/lib/integrations/tooling/oxfmt.ts` to mirror `src/lib/integrations/tooling/oxlint.ts`.

Add:

- canonical config filename constant: `oxfmt.config.ts`
- legacy filename constants for `.oxfmtrc.json` and `.oxfmtrc.jsonc`
- richer `exists(...)` result with active format, paths, and dual-config detection
- TS config generation helper similar in spirit to `toTsConfigContent(...)` in oxlint

Recommended `exists(...)` result shape:

- `format: "json" | "jsonc" | "ts" | null`
- `hasBoth: boolean`
- `path`
- `tsPath`
- `jsonPath`
- `jsoncPath`

Recommended `create(...)` behavior:

- create `oxfmt.config.ts`
- import `defineConfig` from `oxfmt`
- import `format` from `adamantite/format`
- export `defineConfig(format)`

Recommended `update(...)` behavior:

- return early when TS config already exists
- migrate JSON/JSONC content into `oxfmt.config.ts`
- parse `.oxfmtrc.jsonc` with a parser that accepts comments and trailing commas
- preserve user overrides by spreading them over `format`
- delete the legacy config file after successful migration
- prefer TS when both TS and legacy config exist

### 4. Add a dedicated legacy migration

Add a migration file parallel to oxlint:

- `src/lib/migrations/legacy-oxfmt-json.ts`

Recommended responsibilities:

- `check(...)` detects legacy formatter config state
- emits a warning when both `oxfmt.config.ts` and `.oxfmtrc.json(c)` exist
- returns `needs_migration` when legacy config is active
- `migrate(...)` calls `oxfmt.update(...)`
- `validate(...)` confirms `oxfmt.config.ts` is now the active config

Register it in:

- `src/lib/migrations/index.ts`

Migration ordering should put the formatter migration before any future formatter-specific steady-state migration logic.

### 5. Make init mirror oxlint behavior

Refactor `setupOxfmtConfig(...)` in `src/commands/init.ts` to match the oxlint flow more closely:

- warn when both modern and legacy configs exist
- migrate legacy config when active
- keep existing `oxfmt.config.ts`
- otherwise create `oxfmt.config.ts`

This should replace the current simpler branch that only updates existing JSON/JSONC config or creates `.oxfmtrc.jsonc`.

### 6. Migrate this repository's own formatter config

Replace the root `.oxfmtrc.json` with `oxfmt.config.ts`.

Preserve any repo-specific options currently present in `.oxfmtrc.json` while moving to the new composed format.

This validates the published preset shape against real use inside the repo.

### 7. Update tests to match the new model

#### Tooling tests

Expand `src/lib/integrations/tooling/__tests__/oxfmt.test.ts` to cover:

- no config exists
- TS config is detected as active
- both TS and legacy configs exist -> TS wins
- `create(...)` writes `oxfmt.config.ts`
- `update(...)` migrates `.oxfmtrc.json`
- `update(...)` migrates `.oxfmtrc.jsonc` with comments and trailing commas
- invalid legacy config returns `InvalidConfigFormat`
- unreadable legacy config returns `FailedToReadFile`

#### Migration tests

Add:

- `src/lib/migrations/__tests__/legacy-oxfmt-json.test.ts`

Cover:

- warning on dual-config state
- legacy JSON migration
- legacy JSONC migration
- validation of `oxfmt.config.ts` as active config

Update:

- `src/lib/migrations/__tests__/index.test.ts`

#### Command tests

Update `src/commands/__tests__/init.test.ts` and `src/commands/__tests__/update.test.ts` to expect:

- `oxfmt.config.ts` creation
- legacy formatter config migration during init
- legacy formatter config migration during update
- dual-config warnings

### 8. Update docs and release notes

Update references from JSON/JSONC formatter config to TypeScript formatter config.

Primary files:

- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`

Documentation should explicitly call out:

- the new canonical config filename: `oxfmt.config.ts`
- that `adamantite/format` is now a module export
- that existing `.oxfmtrc.json(c)` users should run `adamantite update`
- that this is a breaking change

### 9. Release and changeset

Because this is a breaking change, create a changeset that:

- marks the release appropriately
- explains the new `oxfmt.config.ts` target
- explains the `adamantite/format` export change
- tells users to run `adamantite update` to migrate legacy config files

## Files To Add Or Change

Expected core changes:

- `presets/format.ts`
- `package.json`
- `bunup.config.ts`
- `src/lib/integrations/tooling/oxfmt.ts`
- `src/commands/init.ts`
- `src/lib/migrations/legacy-oxfmt-json.ts`
- `src/lib/migrations/index.ts`
- `oxfmt.config.ts`
- `README.md`
- `AGENTS.md`
- `CHANGELOG.md`

Expected test changes:

- `src/lib/integrations/tooling/__tests__/oxfmt.test.ts`
- `src/lib/migrations/__tests__/legacy-oxfmt-json.test.ts`
- `src/lib/migrations/__tests__/index.test.ts`
- `src/commands/__tests__/init.test.ts`
- `src/commands/__tests__/update.test.ts`
- `src/__tests__/package-metadata.test.ts`

Expected removals:

- `presets/format.json`
- `.oxfmtrc.json`

## Risks

- Importing `adamantite/format` inside generated `oxfmt.config.ts` changes the consumer contract from static JSON to executable module config.
- Some consumers may rely on `adamantite/format` being JSON-importable today.
- Object-spread migration can preserve top-level options cleanly, but future nested merge semantics need to stay intentional.
- Users with both `oxfmt.config.ts` and `.oxfmtrc.json(c)` may have drift between files.

## Risk Mitigation

- Treat the release as breaking and document it clearly.
- Provide an automatic migration in `adamantite update`.
- Prefer `oxfmt.config.ts` when both config shapes exist and warn clearly.
- Keep migrated output simple and readable: import preset, spread user overrides, export `defineConfig(...)`.
- Add strong tests for JSON, JSONC, and dual-config scenarios before release.

## Acceptance Criteria

- Adamantite manages `oxfmt.config.ts` as the canonical formatter config
- `adamantite init` creates `oxfmt.config.ts` for fresh projects
- `adamantite init` migrates legacy `.oxfmtrc.json(c)` when present
- `adamantite update` migrates legacy `.oxfmtrc.json(c)` to `oxfmt.config.ts`
- legacy formatter config files are removed after successful migration
- `adamantite/format` is published as a JS/TS module export
- tests cover create, detect, migrate, dual-config, and failure paths
- docs and changelog clearly describe the breaking change and migration path
