---
name: adamantite
description: Configures and maintains Adamantite linting, formatting, type-safety, analysis, editor, and CI tooling in TypeScript projects. Use when initializing Adamantite, running its checks, updating managed dependencies, or following Doctor findings in an existing installation.
metadata:
  type: core
  library: adamantite
  library_version: "0.37.0"
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
npx adamantite init --non-interactive --script check --script fix --typescript --agents
```

Repeat `--script`, `--preset`, and `--editor` for multiple values. Available values are:

- Scripts: `check`, `fix`, `analyze`. In a detected monorepo, `analyze` also installs Sherif.
- Presets: `react`, `nextjs`, `vue`, `jest`, `vitest`, `node`, `antislop`, `shadcn`; editors:
  `vscode`, `zed`
- Optional flags: `--typescript`, `--install-extensions`, `--github-actions`, `--agents`,
  `--overwrite-scripts`

The `shadcn` preset needs Tailwind v4 and the `@shadcn/lint` package, which `init` installs
at a pinned version and doctor and `update` keep in sync. The plugin finds components and
the theme through `components.json`. Without that file it looks in `components/ui` or
`src/components/ui` and discovers the stylesheet that imports Tailwind; when components
live elsewhere, set `settings.shadcn` (for example `{ ui: "@/ds" }`) in `oxlint.config.ts`.
The preset turns off the component-owned rules under `**/components/ui/**`; add the same
override for another component directory.

Adamantite requires TypeScript 7 or later as a dependency in the project's own
`package.json`. Without that entry, npm cannot add or update a managed plugin.

Only select options supported by the project. Presets and TypeScript require `check` or `fix`;
extension installation requires an editor; `--github-actions` requires a CI-compatible script
and a supported package manager (bun, deno, npm, pnpm, or yarn). Omitted boolean flags are
disabled.

Existing package scripts whose commands differ from Adamantite's are kept and reported,
not replaced; pass `--overwrite-scripts` to replace them. Custom flags can be forwarded
to the Adamantite command after `--`, e.g. `adamantite analyze -- --directory packages/app`.

## Daily workflow

Use the scripts written by `init` when available. Otherwise invoke the CLI directly:

```shell
adamantite check
adamantite fix
adamantite analyze
```

- Use `check` for read-only formatting, lint, and type-error validation. `check --only lint` or `check --only format`
  runs one stage.
- Use `fix` for automatic Oxlint fixes followed by Oxfmt formatting. Add `--suggested`, `--dangerous`, or `--all` only
  with explicit permission after reviewing their impact. `fix --only lint` or `fix --only format` runs one stage.
- Use `analyze` for unused dependencies, exports, and files. In a monorepo it first checks
  workspace dependency consistency with Sherif. `analyze --only monorepo` or
  `analyze --only unused` runs one stage. `analyze --fix` may remove files, so inspect
  findings before using it. Sherif refuses to fix when `CI` is set, so in a monorepo
  `analyze --fix` fails there; use `analyze --only unused --fix` for the Knip fixes.
- In a monorepo, `analyze --fix` needs a terminal when Sherif must choose between versions.
  Without a terminal, set `"sherif": { "select": "highest" }` in the root `package.json`, or
  use `analyze --only unused --fix` to skip Sherif.
- `analyze` runs Sherif without flags. Put Sherif exceptions in the `sherif` field of the root
  `package.json` (camelCase CLI options, e.g. `"ignoreDependency": ["tailwindcss"]`).

To pass arguments to Knip, Oxlint, or Sherif, place them after `--`. For `check` and `fix` they
go to Oxlint. For `analyze` they go to Knip, or to the stage that `--only` selects, so a Sherif
flag needs `--only monorepo`. For a permanent Sherif setting, use the `sherif` field instead.

```shell
adamantite check src -- --deny-warnings
bun run analyze -- -- --directory packages/app
adamantite analyze --only monorepo -- --ignore-package package-a
```

## Diagnose and repair

Run the read-only assessment:

```shell
adamantite doctor
```

Follow each finding. Doctor supplies the current state, the goal criteria, reference
content when needed, and the verification command. In an interactive terminal, Doctor
offers to hand off to an installed coding agent CLI, or to copy the combined Markdown prompt. In a
non-interactive run — the path an agent uses — Doctor prints Markdown directly. Findings
produce a repair prompt and exit 1. Assessment warnings alone produce a warning report
and exit 0. Run `adamantite doctor` again until it exits 0.

## Update

For an existing installation, run:

```shell
adamantite update
adamantite doctor
```

`update` updates Adamantite-managed dependencies. It then reports any remaining doctor
findings. Follow those findings and review the resulting diff.

## Decision guide

- New target project: `init`, then run the configured checks.
- Suspected drift or broken setup: run `doctor` and follow its findings.
- Existing project upgrading Adamantite: `update`, then the doctor sequence.
- Code-quality failure: choose `check` or `analyze` based on the failing subsystem; do not
  reinitialize the project.
- Unknown option or behavior: run `adamantite <command> --help` before guessing.
