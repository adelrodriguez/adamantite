# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "_.ts, _.tsx, _.html, _.css, _.js, _.jsx, package.json"
alwaysApply: false

---

## Project Overview

Adamantite is an opinionated preset package for modern TypeScript applications that provides:

- **oxlint configuration** (`presets/oxlint/*.json`) - Modular linting rules (core, React, Next.js)
- **oxfmt configuration** (`presets/oxfmt.json`) - Code formatting configuration
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

### Build Process

- **bunup** (`bunup.config.ts`) bundles CLI to `dist/index.js` with minification
- Entry point: `src/index.ts` → Output: `dist/index.js` (executable via `adamantite` command)

### Configuration Files

- **`presets/oxlint/core.json`** - Core linting rules for all TypeScript/JavaScript projects
- **`presets/oxfmt.json`** - Code formatting configuration
- **`presets/tsconfig.json`** - Reusable TypeScript configuration
