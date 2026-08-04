# Context

Domain language and orientation for Adamantite. Read this before exploring or changing
code so you use the project's own terms instead of inventing synonyms. This file
describes _what things mean_; standing rules and commands live in `AGENTS.md`.

## What Adamantite is

Adamantite is an opinionated **preset** package for modern TypeScript applications. It
ships configuration and a CLI that applies and maintains that configuration in a target
project. It provides:

- **oxlint configuration** (`presets/lint/*.ts`) — modular linting rules (core, React, Next.js)
- **oxfmt configuration** (`presets/format.ts`) — code formatting configuration
- **TypeScript preset** (`presets/tsconfig.json`) — strict TypeScript configuration
- **CLI tool** — commands to run oxlint linting and oxfmt formatting via the `adamantite` command

## Glossary

- **Preset** — the shipped configuration under `presets/` (lint, format, tsconfig) that
  a target project consumes.
- **Target project** — the user's repository that Adamantite is configuring. Distinct
  from _this_ repository (the Adamantite source itself).
- **Integration** — an adapter under `src/lib/integrations/**` for a tool, editor, or CI
  system. Each integration module exports only the integration itself (default export);
  `src/lib/integrations/base.ts` is the shared-infrastructure exception.
- **Migration** — one-off transition logic under `src/lib/migrations/**` that handles
  upgrades falling outside an integration's normal lifecycle (legacy formats, legacy
  scripts, one-off upgrades).
- **Managed script** — a `package.json` script entry Adamantite owns. Types and helpers
  (`Script`, `MANAGED_SCRIPT_COMMANDS`, `getManagedScripts`) live in
  `src/lib/workspace/package-json.ts`.

### Integration lifecycle verbs

Every integration is described by these operations:

- **`detect`** — inspects whether the integration is present and, for tooling integrations,
  which config format is active and which legacy configs coexist with it.
- **`create`** — writes the latest supported config from scratch.
- **`update`** — safely rewrites an existing latest-format config into the latest
  supported shape.
- **`migrations`** — handle transitions that fall outside `detect` / `create` /
  `update`, such as legacy formats, legacy scripts, or one-off upgrades.
- **`assess`** — read-only. Classifies package drift, missing config, supported config
  updates, manual follow-up work, and known migrations. It does not mutate files or call
  migrations.
- **`doctor` / `doctor --fix`** — `doctor --fix` dispatches `create_config` through
  `create`, `update_config` through `update`, and `run_migration` through the migration
  system. `manual_fix` is report-only.

Integrations are defined through a single `defineIntegration` boundary. Its `kind`
discriminant establishes the required capabilities: tooling integrations provide a package
version and read-only assessment, while editor, workspace, and CI integrations provide
`detect` / `create` / `update`. Additional capabilities remain available on the exact inferred
integration type.

## Codebase map

### CLI structure (`src/`)

- **`index.ts`** — main CLI entry point using yargs
- **`commands/`** — command implementations:
  - `fix.ts` — runs oxlint to fix issues
  - `check.ts` — runs oxlint to check for issues
  - `format.ts` — runs oxfmt for code formatting
  - `init.ts` — initializes Adamantite configuration
  - `monorepo.ts` — runs monorepo-specific checks (use `--fix` to auto-fix issues)
  - `update.ts` — updates Adamantite configuration
- **`lib/`** — internal library code grouped by concern:
  - `services/` — Effect services used by commands
  - `integrations/` — adapters for tooling, editors, and CI
  - `workspace/` — logic that operates on the target project on disk
  - `shared/` — cross-cutting utilities and error types
- **`version.ts`** — package version detection

### Preset / configuration files

- **`presets/lint/core.ts`** — core linting rules for all TypeScript/JavaScript projects
- **`presets/format.ts`** — code formatting configuration
- **`presets/tsconfig.json`** — reusable TypeScript configuration

### Build pipeline

- **bunup** (`bunup.config.ts`) bundles the CLI to `dist/index.js` with minification.
- Entry point: `src/index.ts` → output: `dist/index.js` (executable via the `adamantite`
  command).

### Dependencies on tooling

Adamantite depends on multiple packages to perform its tasks. These dependencies are
defined inside the `src/lib/integrations/tooling/` directory. Each package has a version
property used to determine the version to install; it should match the version in
`package.json`.
