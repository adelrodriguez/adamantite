# AGENTS.md

This project was built with [`pastry`](https://github.com/adelrodriguez/pastry) template.

## Quality Control

- We use `adamantite` for linting, formatting and type checking.
- Always run `bun run format` after editing files.
- After making changes, run `bun run check` and `bun run test` to ensure the code is still valid.
- After installing or removing dependencies, run `bun run analyze` to ensure we are not using any dependencies that are not needed.

## Changesets

- We use `changesets` for versioning and changelog management.
- Run `bun changeset --empty` to create a new empty changeset file.
- Never make a major version bump unless the user requests it.
- If a breaking change is being made, and we are on v1.0.0 or higher, alert the user.

## Project Overview

Adamantite is an opinionated preset package for modern TypeScript applications that provides:

- **oxlint configuration** (`presets/lint/*.ts`) - Modular linting rules (core, React, Next.js)
- **oxfmt configuration** (`presets/format.json`) - Code formatting configuration
- **TypeScript preset** (`presets/tsconfig.json`) - Strict TypeScript configuration
- **CLI tool** - Commands to run oxlint linting and oxfmt formatting via `adamantite` command

## Development Commands

Use Bun for all package management and script execution:

- **Install dependencies**: `bun install`
- **Build CLI**: `bun run build` (uses bunup to bundle `src/index.ts` → `dist/`)
- **Run tests**: `bun test` or `bun run test:watch` for watch mode
- **Code checking**: `bun run check` (checks for issues and type errors)
- **Code fixing**: `bun run fix` (auto-fixes issues and formats code)
- **Code formatting**: `bun run format` (formats code with oxfmt)

## Code Quality Workflow

After editing files, always run:

1. `bun run test` - Run tests to ensure everything works
2. `bun run check` - Check for linting issues and type errors
3. `bun run fix` - Auto-fix issues and format code
4. `bun run format` - Format code explicitly (run after editing various files)

Make sure to always run format after editing files, including creating documentation like changesets and README.md.

## Release Workflow

This project uses changesets for version management:

1. **Create changeset**: `bunx changeset` (interactive prompt for version bump)
2. **Version locally**: `bun run version` (bumps package.json and updates CHANGELOG)
3. **Publish**: Push to main → CI passes → auto-publishes to npm

## Code Style

- Prefer function declarations over arrow functions for standalone functions (e.g. `function getImportName(...)` instead of `const getImportName = (...) =>`).
- Keep arrow functions when returning an Effect chain (e.g. `const foo = (args) => Effect.gen(...)`), or when they are callbacks, object methods, or otherwise more pleasant as arrows.
- Format TypeScript suppression comments as `@ts-expect-error - reason` so they fail loudly if the underlying type issue is fixed.
- Prefer `@ts-expect-error - reason` over casts like `as never` when suppressing known third-party type mismatches, so upstream type fixes become visible.

## Architecture

### CLI Structure (`src/`)

- **`index.ts`** - Main CLI entry point using yargs
- **`commands/`** - Command implementations:
  - `fix.ts` - Runs oxlint to fix issues
  - `check.ts` - Runs oxlint to check for issues
  - `format.ts` - Runs oxfmt for code formatting
  - `init.ts` - Initializes Adamantite configuration
  - `monorepo.ts` - Runs monorepo-specific checks (use `--fix` to auto-fix issues)
  - `update.ts` - Updates Adamantite configuration
- **`lib/`** - Internal library code grouped by concern:
  - `services/` - Effect services used by commands
  - `integrations/` - Adapters for tooling, editors, and CI
  - `workspace/` - Logic that operates on the target project on disk
  - `shared/` - Cross-cutting utilities and error types
- **`version.ts`** - Package version detection

### Dependency Management

Adamantite depends on multiple packages to perform its tasks. These dependencies are defined inside the `src/lib/integrations/tooling/` directory.

Each package has a version property that is used to determine the version of the package to install, and it should match the version of the package in the `package.json` file. If the version in the `package.json` file is higher, we should update the version in its respective integration object.

### Build Process

- **bunup** (`bunup.config.ts`) bundles CLI to `dist/index.js` with minification
- Entry point: `src/index.ts` → Output: `dist/index.js` (executable via `adamantite` command)

### Configuration Files

- **`presets/lint/core.ts`** - Core linting rules for all TypeScript/JavaScript projects
- **`presets/format.json`** - Code formatting configuration
- **`presets/tsconfig.json`** - Reusable TypeScript configuration
