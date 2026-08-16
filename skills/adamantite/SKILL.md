---
name: adamantite
description: Configures and maintains Adamantite linting, formatting, type-safety, analysis, editor, and CI tooling in TypeScript projects. Use when initializing Adamantite, running its checks, repairing a broken or drifted setup, or updating and migrating an existing installation.
metadata:
  type: core
  library: adamantite
  library_version: "0.34.0"
sources:
  - "adelrodriguez/adamantite:src/cli.ts"
  - "adelrodriguez/adamantite:src/commands/*.ts"
---

# Adamantite

Adamantite is an opinionated preset package and CLI for modern TypeScript projects. Run
commands from the target project's root and use its detected package manager.

## Quick start

For a human-driven setup, run `npx adamantite init`. For an agent, prefer explicit
non-interactive setup. Setup flags require `--non-interactive`, and at least one
`--script` is required:

```shell
npx adamantite init --non-interactive --script check --script fix --script format --typescript --agents
```

Repeat `--script`, `--preset`, and `--editor` for multiple values. Available values are:

- Scripts: `check`, `fix`, `format`, `analyze`, `check:monorepo`, `fix:monorepo`
- Presets: `react`, `nextjs`, `vue`, `jest`, `vitest`, `node`, `antislop`; editors:
  `vscode`, `zed`
- Optional flags: `--typescript`, `--install-extensions`, `--github-actions`, `--agents`,
  `--overwrite-scripts`

Only select options supported by the project. Presets and TypeScript require `check` or
`fix`; extension installation requires an editor; monorepo scripts require a detected
monorepo; `--github-actions` requires a CI-compatible script and a supported package
manager (bun, deno, npm, pnpm, or yarn). Omitted boolean flags are disabled.

Existing package scripts whose commands differ from Adamantite's are kept and reported,
not replaced; pass `--overwrite-scripts` to replace them. Custom flags can be forwarded
to the Adamantite command after `--`, e.g. `adamantite monorepo -- --ignore-dependency tailwindcss`.

## Daily workflow

Use the scripts written by `init` when available. Otherwise invoke the CLI directly:

```shell
adamantite check
adamantite fix
adamantite format
adamantite format --check
adamantite analyze
adamantite monorepo
```

- Use `check` for read-only lint and type-error validation.
- Use `fix` for automatic oxlint fixes. Add `--suggested`, `--dangerous`, or `--all` only
  with explicit permission after reviewing their impact.
- Use `format` to write formatting changes and `format --check` for read-only CI checks.
- Use `analyze` for unused dependencies, exports, and files. `analyze --fix` may remove
  files, so inspect findings before using it.
- Use `monorepo` to inspect workspace dependency consistency and `monorepo --fix` to fix it.

To pass arguments to Knip, Oxlint, Oxfmt, or Sherif, place them after `--`:

```shell
adamantite check src -- --deny-warnings
bun run analyze -- -- --directory packages/app
```

## Diagnose and repair

Start with the read-only assessment:

```shell
adamantite doctor
```

If it reports safe automatic actions, apply them and reassess:

```shell
adamantite doctor --fix
adamantite doctor
```

`doctor --fix` is the mutating repair dispatcher. It installs or updates managed packages,
creates or updates supported configs, and runs known migrations. Manual-fix findings remain
report-only; follow their instructions instead of overwriting custom configuration.

## Update and migrate

For an existing installation, run:

```shell
adamantite update
adamantite doctor --fix
adamantite doctor
```

`update` runs applicable legacy migrations and updates Adamantite-managed dependencies. It
may leave supported config creation, config updates, or manual work to `doctor --fix`.
Migrations restore affected files if they fail; still review the resulting diff and run the
project's tests after any mutation.

## Decision guide

- New target project: `init`, then run the configured checks.
- Suspected drift or broken setup: `doctor`, then `doctor --fix` if appropriate.
- Existing project upgrading Adamantite: `update`, then the doctor sequence.
- Code-quality failure: choose `check`, `format --check`, `analyze`, or `monorepo` based on
  the failing subsystem; do not reinitialize the project.
- Unknown option or behavior: run `adamantite <command> --help` before guessing.
