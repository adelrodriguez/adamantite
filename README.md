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
- **Setup maintenance**: Assess managed integrations with `doctor`, apply safe fixes, and
  migrate older Adamantite configurations.
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

Assess every Adamantite-managed integration. The default command is read-only. Use
`--fix` to install or update managed packages, create missing supported configurations,
update supported configurations, and run known migrations.

```sh
adamantite doctor
adamantite doctor --fix
adamantite doctor
```

Manual-fix findings remain report-only.

### `adamantite update`

Run applicable migrations and update Adamantite-managed dependencies:

```sh
adamantite update
adamantite doctor --fix
adamantite doctor
```

`update` handles known legacy transitions, including JSON Oxlint, Oxfmt, and Knip
configurations and the legacy type-check script. Use `doctor --fix` afterward to complete
safe setup repairs.

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

## Requirements and boundaries

- Adamantite requires Bun 1.0 or later when run with Bun, or Node.js 22.19 or later when
  run with Node.js.
- This repository uses Bun, but the CLI can configure projects that use Bun, Deno, npm,
  pnpm, or Yarn where the selected integration supports them.
- Adamantite manages recognized package scripts and supported configuration shapes. It
  reports custom configurations that require manual work instead of overwriting them.
- `fix`, `format`, `analyze --fix`, `monorepo --fix`, `doctor --fix`, `init`, and `update`
  can change project files. Review the resulting diff.

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
