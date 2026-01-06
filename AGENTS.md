# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

Adamantite is an opinionated preset package for modern TypeScript applications that provides:

- **oxlint configuration** (`presets/lint/*.json`) - Modular linting rules (core, React, Next.js)
- **oxfmt configuration** (`presets/format.json`) - Code formatting configuration
- **TypeScript preset** (`presets/tsconfig.json`) - Strict TypeScript configuration
- **CLI tool** - Commands to run oxlint linting and oxfmt formatting via `adamantite` command

## Development Commands

Use Bun for all package management and script execution:

- **Install dependencies**: `bun install`
- **Build CLI**: `bun run build` (uses bunup to bundle `src/index.ts` → `dist/`)
- **Run tests**: `bun test` or `bun run test:watch` for watch mode
- **Type checking**: `bun run typecheck` (uses tsgo - TypeScript Go)
- **Code checking**: `bun run check` (checks for issues)
- **Code fixing**: `bun run fix` (auto-fixes issues and formats code)
- **Code formatting**: `bun run format` (formats code with oxfmt)

## Code Quality Workflow

After editing files, always run:

1. `bun run test` - Run tests to ensure everything works
2. `bun run typecheck` - Verify TypeScript types using tsgo
3. `bun run check` - Check for linting issues
4. `bun run fix` - Auto-fix issues and format code
5. `bun run format` - Format code explicitly (run after editing various files)

Make sure to always run format after editing files, including creating documentation like changesets and README.md.

## Release Workflow

This project uses changesets for version management:

1. **Create changeset**: `bunx changeset` (interactive prompt for version bump)
2. **Version locally**: `bun run version` (bumps package.json and updates CHANGELOG)
3. **Publish**: Push to main → CI passes → auto-publishes to npm

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
- **`utils.ts`** - Shared utilities (package manager detection, error handling)
- **`version.ts`** - Package version detection

### Dependency Management

Adamantite depends on multiple packages to perform its tasks. These dependencies are defined inside the `src/helpers/packages/` directory.

Each package has a version property that is used to determine the version of the package to install, and it should match the version of the package in the `package.json` file. If the version in the `package.json` file is higher, we should update the version in its respective helper object.

### Build Process

- **bunup** (`bunup.config.ts`) bundles CLI to `dist/index.js` with minification
- Entry point: `src/index.ts` → Output: `dist/index.js` (executable via `adamantite` command)

### Configuration Files

- **`presets/lint/core.json`** - Core linting rules for all TypeScript/JavaScript projects
- **`presets/format.json`** - Code formatting configuration
- **`presets/tsconfig.json`** - Reusable TypeScript configuration
