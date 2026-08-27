<p align="center">
  <h1 align="center">💠 Adamantite</h1>
  <p align="center">
    <strong>Opinionated code-quality tooling for modern TypeScript projects.</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/adamantite">
    <img src="https://img.shields.io/npm/v/adamantite.svg" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/adamantite">
    <img src="https://img.shields.io/npm/dm/adamantite.svg" alt="npm downloads">
  </a>
  <a href="https://github.com/adelrodriguez/adamantite/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/adelrodriguez/adamantite.svg" alt="license">
  </a>
</p>

Adamantite provides one CLI and a set of presets for linting, formatting, type checking,
dependency analysis, and monorepo checks. It configures Oxlint, Oxfmt, TypeScript, Knip,
and Sherif so humans and coding agents can use the same project workflow.

---

## Features

- **Fast checks**: Run Oxlint and Oxfmt on the Oxc toolchain.
- **Strict defaults**: Use opinionated lint and TypeScript presets without assembling a
  configuration from scratch.
- **Optional presets**: Add rules for different needs — frameworks like React, Next.js,
  and Vue, test runners like Jest and Vitest, Node.js, and stricter opt-in rule sets.
- **Project setup**: Create package scripts, configuration files, editor settings, and CI
  through an interactive or non-interactive initializer.
- **Setup maintenance**: Assess managed integrations with `doctor`, update managed
  dependencies, and give humans or agents repair instructions.
- **Workspace checks**: Find unused code with Knip and dependency inconsistencies with
  Sherif.
- **Agent guidance**: Add a managed Adamantite section to `AGENTS.md`.

## Quick start

Run the initializer from the root of a TypeScript project:

```sh
npx adamantite init
```

The interactive setup lets you choose package scripts, presets, TypeScript, editors, CI,
and agent guidance. After setup, use the scripts written to `package.json`:

```sh
bun run check
bun run fix
bun run format
bun run analyze
```

Use the equivalent `adamantite` commands directly when the project does not have managed
scripts:

```sh
adamantite check
adamantite fix
adamantite format
adamantite analyze
adamantite monorepo
```

## Non-interactive setup

Use `--non-interactive` to configure a project entirely from flags. Specify at least one
`--script`. Repeat `--script`, `--preset`, and `--editor` to select multiple values.

```sh
npx adamantite init \
  --non-interactive \
  --script check \
  --script fix \
  --script format \
  --script analyze \
  --preset react \
  --editor vscode \
  --typescript \
  --install-extensions \
  --github-actions \
  --agents
```

Available setup values:

- Scripts: `check`, `fix`, `format`, `analyze`, `check:monorepo`, and `fix:monorepo`.
- Presets: `react`, `nextjs`, `vue`, `jest`, `vitest`, and `node`.
- Editors: `vscode` and `zed`.

Presets and TypeScript require the `check` or `fix` script. Editor extension installation
requires an editor. Monorepo scripts require a detected monorepo. GitHub Actions requires a
compatible script and a supported package manager. Omitted boolean flags are disabled.

Existing package scripts whose commands differ from Adamantite's are kept and reported
instead of being replaced. The interactive initializer asks before overwriting them; in
non-interactive mode, pass `--overwrite-scripts` to replace them. To keep custom flags,
forward them to the Adamantite command after `--`, e.g.
`adamantite monorepo -- --ignore-dependency tailwindcss`.

In a detected monorepo, TypeScript setup does not write a root `tsconfig.json`, because a
catch-all root config makes TypeScript treat all packages as one project. Adamantite
prints guidance instead: add `"extends": "adamantite/typescript"` to each package's
`tsconfig.json` or to a shared base config.

## Commands

Run `adamantite --help` or `adamantite <command> --help` for the complete CLI reference.

### `adamantite check`

Find lint and type errors without changing files:

```sh
adamantite check
adamantite check src
```

### `adamantite fix`

Apply safe Oxlint fixes. Suggested and dangerous fixes require explicit flags:

```sh
adamantite fix
adamantite fix --suggested
adamantite fix --dangerous
adamantite fix --all
```

### `adamantite format`

Format files with Oxfmt, or check formatting without writing:

```sh
adamantite format
adamantite format src/index.ts
adamantite format --check
```

### `adamantite analyze`

Find unused dependencies, exports, and files with Knip. The `--fix` option can remove
unused files, so review its effect before use.

```sh
adamantite analyze
adamantite analyze --strict
adamantite analyze --fix
```

### `adamantite monorepo`

Find dependency consistency problems in a monorepo with Sherif:

```sh
adamantite monorepo
adamantite monorepo --fix
```

### `adamantite doctor`

Assess every Adamantite-managed integration. Doctor is read-only. Each finding describes
the current state, the goal state, and how to verify the repair.

```sh
adamantite doctor
```

In an interactive terminal, Doctor presents each finding as formatted text and offers to
hand off to Claude Code or Codex, or to copy one combined Markdown repair prompt. A
handoff starts the selected agent CLI in the terminal with a short seed prompt; the agent
runs `adamantite doctor` itself to read the findings and edits the project under its own
permission and trust flow. When the agent session ends, Doctor reassesses and exits 0
only when no findings remain. Handoff needs the `claude` or `codex` CLI on `PATH` and
warns before starting an agent on a working tree that is not known to be clean.

A coding agent can also run `adamantite doctor` in the target project to receive Markdown
directly. In a non-interactive run, Doctor prints the combined repair prompt and exits 1
when findings remain. If only assessment warnings remain, Doctor prints a Markdown
warning report and exits 0.

### `adamantite update`

Update Adamantite-managed dependencies, then report any setup findings:

```sh
adamantite update
adamantite doctor
```

`update` exits 0 when dependency updates succeed, even if doctor findings remain. Use
`adamantite doctor` as the CI gate.

### Pass arguments to underlying tools

Commands that invoke Knip, Oxlint, Oxfmt, or Sherif forward arguments after `--`:

```sh
adamantite analyze --strict -- --directory packages/app
adamantite check src -- --deny-warnings
adamantite format -- --ignore-path .formatignore
adamantite monorepo -- --ignore-package package-a
```

Package managers consume one separator, so package scripts need a second one:

```sh
bun run analyze -- -- --directory packages/app
npm run analyze -- -- --directory packages/app
```

`init`, `doctor`, and `update` do not forward arguments because they do not invoke one
underlying CLI.

## Presets

Adamantite publishes configuration that can also be consumed directly:

| Export                     | Purpose                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adamantite/lint`          | Core Oxlint rules.                                                                                                                                                                                                                                                      |
| `adamantite/lint/react`    | React, JSX accessibility, and performance.                                                                                                                                                                                                                              |
| `adamantite/lint/nextjs`   | Next.js rules.                                                                                                                                                                                                                                                          |
| `adamantite/lint/vue`      | Vue rules.                                                                                                                                                                                                                                                              |
| `adamantite/lint/node`     | Node.js rules.                                                                                                                                                                                                                                                          |
| `adamantite/lint/jest`     | Jest rules.                                                                                                                                                                                                                                                             |
| `adamantite/lint/vitest`   | Vitest rules.                                                                                                                                                                                                                                                           |
| `adamantite/lint/antislop` | Vendored [anti-slop](https://github.com/dmmulroy/anti-slop) rules that reject low-evidence, low-signal patterns. Also turns off `typescript/consistent-indexed-object-style` and `unicorn/no-immediate-mutation` from the core preset, which conflict with these rules. |
| `adamantite/format`        | Oxfmt configuration.                                                                                                                                                                                                                                                    |
| `adamantite/analyze`       | Knip configuration.                                                                                                                                                                                                                                                     |
| `adamantite/typescript`    | Strict TypeScript configuration for TS 7+.                                                                                                                                                                                                                              |

When consuming the lint presets directly, hoist the core preset's ignore patterns onto the
root config. Oxlint does not merge `ignorePatterns` from extended configs, so without the
hoist, dependencies, build output, and generated code are only skipped when your
`.gitignore` happens to cover them:

```ts
import { defineConfig } from "oxlint"
import core from "adamantite/lint"

export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns,
})
```

Configs generated by `adamantite init` include this automatically.

## Requirements and boundaries

- Adamantite requires Bun 1.0 or later when run with Bun, or Node.js 22.19 or later when
  run with Node.js.
- This repository uses pnpm and Node.js for development, but the CLI can configure
  projects that use Bun, Deno, npm, pnpm, or Yarn where the selected integration supports
  them.
- Adamantite manages recognized package scripts and supported configuration shapes. It
  reports custom configurations that require manual work instead of overwriting them.
- `fix`, `format`, `analyze --fix`, `monorepo --fix`, `init`, and `update` can change
  project files. Doctor is read-only.

## Agent skill

Install the first-party Adamantite skill to teach coding agents how to initialize, assess,
repair, and update a project:

```sh
npx skills add adelrodriguez/adamantite --list
npx skills add adelrodriguez/adamantite --skill adamantite
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow. Contributors should
also read the [domain glossary](CONTEXT.md) and [architecture reference](docs/architecture.md).

## License

Adamantite uses the [MIT License](LICENSE).

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)
