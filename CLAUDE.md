# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "_.ts, _.tsx, _.html, _.css, _.js, _.jsx, package.json"
alwaysApply: false

---

## Project Overview

Adamantite is an opinionated preset package for modern TypeScript applications that provides:

- **Biome configuration** (`biome.jsonc`) - Comprehensive linting and formatting rules
- **TypeScript preset** (`presets/tsconfig.json`) - Strict TypeScript configuration
- **CLI tool** - Commands to run Biome linting and formatting via `adamantite` command

## Development Commands

Use Bun for all package management and script execution:

- **Install dependencies**: `bun install`
- **Build CLI**: `bun run build` (uses tsdown to bundle `cli/index.ts` → `dist/`)
- **Run tests**: `bun test` or `bun run test:watch` for watch mode
- **Type checking**: `bun run typecheck`
- **Linting**: `bun run lint` (auto-fixes issues)
- **Formatting**: `bun run format` (auto-formats code)

## Release Workflow

This project uses changesets for version management:

1. **Create changeset**: `bunx changeset` (interactive prompt for version bump)
2. **Version locally**: `bun run version` (bumps package.json and updates CHANGELOG)
3. **Publish**: Push to main → CI passes → auto-publishes to npm

## Architecture

### CLI Structure (`cli/`)

- **`index.ts`** - Main CLI entry point using Commander.js
- **`actions/`** - Command implementations:
  - `format.ts` - Runs Biome formatter via npx
  - `lint.ts` - Runs Biome linter via npx
- **`utils.ts`** - Shared utilities (process execution, package info)

### Build Process

- **tsdown** (`tsdown.config.ts`) bundles CLI to `dist/index.js` with minification
- Entry point: `cli/index.ts` → Output: `dist/index.js` (executable via `adamantite` command)

### Configuration Files

- **`biome.jsonc`** - Main export, comprehensive Biome config with strict rules
- **`presets/tsconfig.json`** - Reusable TypeScript configuration

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```
