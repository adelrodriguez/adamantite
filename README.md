<p align="center">
  <h1 align="center">💠 Adamantite</h1>
  <p align="center">
    <strong>Strict, agent-first code-quality toolchain for TypeScript codebases.</strong>
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

Adamantite is a strict, agent-first set of presets and a CLI that help coding agents write
excellent code. It configures Oxlint, Oxfmt, TypeScript, Knip, and Sherif with strict
standards that agents must follow, and it gives agents the instructions to set up, repair,
and update the project.

---

## Features

- **Fast checks**: Run Oxlint and Oxfmt on the Oxc toolchain.
- **Strict defaults**: Use opinionated lint and TypeScript presets without assembling a
  configuration from scratch.
- **Optional presets**: Add rules for different needs — frameworks like React, Next.js,
  and Vue, test runners like Jest and Vitest, Node.js, and stricter opt-in rule sets.
- **Project setup**: Create package scripts, configuration files, editor settings, and CI
  through an interactive or non-interactive initializer.
- **Setup maintenance**: Assess the integrations with `doctor`, update managed
  dependencies, and give humans or agents repair instructions.
- **Custom rules**: Write project-specific Oxlint rules in `.adamantite/lint/`, one rule
  for each file, and enable all of them with one line.
- **Hardening**: Have a coding agent turn the coding standards that your code already
  follows into custom rules, and into instructions for the ones that no rule can check.
- **Workspace checks**: Find unused code with Knip and dependency inconsistencies with
  Sherif.
- **Agent guidance**: Write an `AGENTS.md` with the Adamantite section when the project has
  none, and add the Adamantite skill for your coding agents.

## Quick start

Run the initializer from the root of a TypeScript project:

```sh
npx adamantite init
```

Oxlint accepts the `options` of a config only in the root config, so `init` makes no changes when
it would set up Oxlint in a folder that a parent Oxlint config lints. It looks in each parent folder
up to the filesystem root, also past a folder that holds `.git`, because Oxlint loads the nested
configs there too. Run `init` at the root of that project, or extend the root config in the folder,
as [Custom rules in a monorepo](#custom-rules-in-a-monorepo) shows.

The interactive setup lets you choose package scripts, presets, TypeScript, editors, CI,
and coding agent setup with the [Adamantite skill](#agent-skill). The scripts prompt starts with
the recommended `check` and `fix` scripts checked. After setup, use the scripts written to `package.json`:

```sh
bun run check
bun run fix
bun run analyze
```

Use the equivalent `adamantite` commands directly when the project does not have managed
scripts:

```sh
adamantite check
adamantite fix
adamantite analyze
```

Init records the setup in `.adamantite/adamantite-lock.json`, the lockfile. Commit it with the
rest of the setup. In a monorepo, the lockfile sits at the workspace root.

```json
{
  "schemaVersion": 1,
  "selection": {
    "agents": true,
    "ci": "github",
    "editors": ["vscode"],
    "presets": ["core", "strict"],
    "scripts": ["check", "fix", "analyze"],
    "typescript": "typescript"
  },
  "version": "0.47.0",
  "written": {
    "oxlint.config.ts": "sha256-…"
  }
}
```

`selection` is what you asked init to set up. A later `init` adds its options to the selection.
`version` is the Adamantite version that last wrote
the lockfile. `written` maps each file that Adamantite wrote whole, by its path from the project
root, to the hash of what it wrote. Doctor reads the selection, and only `init` and `update` write
the lockfile.

## Non-interactive setup

Use `--non-interactive` to configure a project entirely from flags. Specify at least one
`--script` or `--typescript`. Repeat `--script`, `--preset`, and `--editor` to select multiple values.

```sh
npx adamantite init \
  --non-interactive \
  --script check \
  --script fix \
  --script analyze \
  --preset react \
  --editor vscode \
  --typescript typescript \
  --github-actions \
  --agents
```

Available setup values:

- Scripts: `check`, `fix`, and `analyze`. In a detected monorepo, `analyze` also installs
  Sherif.
- Presets: `react`, `react-strict`, `tanstack`, `nextjs`, `vue`, `effect`,
  `jest`, `vitest`, `architecture`, `strict`, and `tailwind`. `react-strict` requires `react`.
  `jest` and `vitest` cannot be selected together.
- Editors: `vscode` and `zed`.
- TypeScript presets: `typescript` and `tsconfig`. See [the TypeScript presets](#the-typescript-presets).

Presets require the `check` or `fix` script. GitHub Actions requires a compatible script and a
supported package manager. Omitted boolean flags are disabled.

`init` and `update` assess the project after the setup and exit 1 when findings remain. In an
interactive terminal they offer the repair through the [resolution menu](#adamantite-doctor).
Without one, they print the Markdown repair prompt. `--json` sets up from the flags, without
`--non-interactive`, and prints the setup and the assessment as one JSON document. See
[JSON output](#json-output).

The GitHub Actions workflow, `.github/workflows/adamantite.yml`, runs the `check` and `analyze`
scripts that you select. It is a managed file: `init` and `update` replace it while it holds what
Adamantite wrote, and keep it once you change it, such as to add your own jobs. Doctor then checks
that a job runs each selected script.
Agents verify custom rules with temporary cases while they work. CI runs the rules through
`check` by default. Users can add an explicit `adamantite rule test` step for optional saved tests.
Init preserves a workflow with an explicit rule-test command, including its setup and other settings.

Each script that you select is a managed script. `init` and `update` set it in `package.json` to
its Adamantite command, such as `"check": "adamantite check"`, and replace what it ran before.
They print each script that they added or replaced, with its earlier command. A script that you
did not select stays as it is. To keep custom flags, put them in a script of your own name and
forward them to the Adamantite command after `--`, such as
`adamantite analyze -- --directory packages/app`. When `init` or `update` changes
`package.json`, it formats the file with the project's Oxfmt, so `adamantite fix` leaves it as it
is.

In a detected monorepo, TypeScript setup does not write a root `tsconfig.json`, because a
catch-all root config makes TypeScript treat all packages as one project. Doctor reports the
packages instead: add `"extends": "adamantite/typescript"`, or `"extends": "adamantite/tsconfig"`
in a library, to each package's `tsconfig.json` or to a shared base config. A root
`tsconfig.json` that Adamantite wrote before the project became a monorepo stays managed.

`init` and `update` write each managed file whole: `oxlint.config.ts`, `oxfmt.config.ts`,
`knip.config.ts`, `tsconfig.json`, `.vscode/settings.json`, `.vscode/extensions.json`,
`.zed/settings.json`, `.github/workflows/adamantite.yml`, a new `AGENTS.md`, and the Adamantite
skill. They write a file only when it does not exist or still holds what Adamantite wrote, by the
hash in the lockfile. They format it with the project's Oxfmt first, so `adamantite fix` leaves
it as it is. A file that you changed stays as it is, and `adamantite doctor` reports a change that
breaks the setup, such as a missing extension recommendation. A file that the setup no longer
needs is deleted when nobody changed it.

The `tsconfig.json` extends the selected preset, and adds the Effect language service entry for
the `effect` preset. A project that keeps a tool's own JSON config, such as `.oxlintrc.json`,
`.oxfmtrc.json`, or `knip.json`, gets no TypeScript config beside it, because the tool would not
load both, and Doctor reports the migration. `.vscode/extensions.json` recommends the Oxc
extension for `check` and `fix`, the Knip extension for `analyze`, and the TypeScript 7 extension
for the `effect` preset, so VS Code offers to install them.

Zed installs extensions only from its user settings, so `init` prints a link to each Zed
extension that the setup needs.

## Commands

Run `adamantite --help` or `adamantite <command> --help` for the complete CLI reference.

When `check`, `fix`, or `analyze` needs a tool that is not installed and that no script of the
lockfile selection runs, such as Oxlint without the `check` or `fix` script, the error names the
command that adds the script and installs the tool, such as
`adamantite init --non-interactive --script check`.

### `adamantite check`

Find formatting, lint, and type errors without changing files:

```sh
adamantite check
adamantite check src
```

`check` runs Oxfmt and Oxlint at the same time, and prints the output of Oxfmt first.

`check` fails when Oxlint reports a warning, because a warning that passes is a pattern that
agents copy. Use `--allow-warnings` to pass with warnings. A forwarded `--max-warnings` or
`--deny-warnings`, such as `adamantite check -- --max-warnings 10`, replaces this default. To keep existing violations of a
rule while new code follows it, turn the rule off for those files in an Oxlint override.

Use `--only` to run one stage. Arguments after `--` go to that stage, and to Oxlint when
both run:

```sh
adamantite check --only lint
adamantite check --only format
```

### `adamantite fix`

Apply safe Oxlint fixes, then format the files with Oxfmt. Suggested and dangerous fixes require
explicit flags:

```sh
adamantite fix
adamantite fix --suggested
adamantite fix --dangerous
adamantite fix --all
```

Oxlint applies one pass of fixes. If one fix causes a report that another fix repairs, run `fix`
again. [oxc#16118](https://github.com/oxc-project/oxc/issues/16118) tracks repeated fix passes.

Use `--only` to run one stage. Arguments after `--` go to that stage, and to Oxlint when
both run:

```sh
adamantite fix --only lint
adamantite fix --only format
```

### `adamantite analyze`

Find unused dependencies, exports, and files with Knip. In a detected monorepo, `analyze`
first finds dependency consistency problems with Sherif. The `--fix` option can remove
unused files, so review its effect before use.

```sh
adamantite analyze
adamantite analyze --strict
adamantite analyze --fix
adamantite analyze --only unused
adamantite analyze --only monorepo --fix -- --select highest
```

- The `monorepo` stage (Sherif) runs first, and only in a detected monorepo. The `unused`
  stage (Knip) always runs.
- Without `--fix`, both stages run and the exit code comes from the first failure. With
  `--fix`, a Sherif failure skips Knip, because Knip must not remove code against a
  dependency graph that Sherif did not repair.
- `--fix` applies to each stage that runs. `--strict` applies to Knip only.
- `--only monorepo` or `--only unused` runs one stage. `--only monorepo` fails outside a
  monorepo and with `--strict`.
- Arguments after `--` go to Knip, or to the stage that `--only` selects.
- `analyze` runs Sherif without flags. Put project exceptions in the `sherif` field of the
  root `package.json`, which Sherif reads. The keys are the Sherif CLI options in camelCase:
  `ignoreDependency`, `ignoreRule`, `ignorePackage`, `select`, `noInstall`, and
  `failOnWarnings`. For example: `"sherif": { "ignoreDependency": ["tailwindcss"] }`.
- A Sherif fix that must choose between versions prompts in a terminal. Without a terminal,
  set `"sherif": { "select": "highest" }` in the root `package.json`, or run
  `adamantite analyze --only monorepo --fix -- --select highest`.
- Use `--fix` locally, not in CI. Sherif refuses to fix in a CI environment (for example when
  `CI` is set), so `analyze --fix` fails there in a monorepo. CI runs `adamantite analyze`
  without `--fix`.

### `adamantite doctor`

Assess every integration of the setup. Doctor is read-only. Each finding describes
the current state, the goal state, and how to verify the repair. Doctor checks each integration
that the lockfile selects, so a selected integration whose file is missing or wrong gets a
finding. Doctor reports a selected managed script that `package.json` does not have, or that runs
another command, because `check` then passes without running Adamantite. A project without a
lockfile gets one finding that says to run `adamantite init`, and Doctor checks nothing else.
Doctor also checks that the
installed packages can run Oxlint: each declared package is installed, and `@effect/tsgo` has
a build for the installed Oxlint, tsrs, and platform. It starts no tool for this check.

```sh
adamantite doctor
```

In an interactive terminal, Doctor presents each finding as formatted text and offers to
hand off to an installed coding agent, or to copy one combined Markdown repair prompt. A
handoff starts the selected agent CLI in the terminal seeded with that same Markdown
repair prompt; the agent edits the project under its own permission and trust flow. When
the agent session ends, Doctor reassesses and exits 0 only when no findings remain.
Doctor detects installed agents by probing each supported CLI — Claude Code (`claude`),
Codex (`codex`), Cursor (`cursor-agent`), Gemini CLI (`gemini`), Grok Build (`grok`),
and OpenCode (`opencode`) — and lists only the ones found on `PATH`. OpenCode pre-fills
its input with the seed prompt, so that handoff needs one Enter press to start.

A coding agent can also run `adamantite doctor` in the target project to receive Markdown
directly. In a non-interactive run, Doctor prints the combined repair prompt and exits 1
when findings remain. If only assessment warnings remain, Doctor prints a Markdown
warning report and exits 0. If no agent CLI starts after you choose it, Doctor prints the prompt
instead. A project that does not declare `adamantite` gets one finding that says to install it.
`adamantite doctor --json` prints the assessment as one JSON document and exits 1 when findings
remain. See [JSON output](#json-output).

### `adamantite harden`

Ask a coding agent to find the coding standards that the project already follows, and to put
each one on the highest step of the
[enforcement ladder](skills/adamantite/references/enforcement-ladder.md) that can hold it. The
steps go from a type that makes the mistake impossible, through rules and project checks, to an
entry in `CODING_STANDARDS.md` with its reason and an example.

```sh
adamantite harden
adamantite harden --path packages/web
adamantite harden --commits 500
```

The prompt lists the Oxlint config of the root and of each workspace package, the rules folders
that their `custom()` calls load, and the `AGENTS.md` of the root and of each package. Agents start
from `AGENTS.md`, so it must point to the other documentation. The prompt also lists each Markdown
file that `git ls-files` gives, except the changesets, the changelogs, and the agent skills, and
the agent reads each one. A coding agent finds the skills in its skill folder, such as
`.agents/skills` or `.claude/skills`, on its own, so no `AGENTS.md` has to reach them.
`--path` limits the session to one package or folder. The prompt then lists the configs of the
packages in that folder, or of the package that contains it, the rules folders that those configs
load, the `AGENTS.md` of the root and of those packages, and the Markdown files of those packages
and of the root. The prompt also lists the Markdown files that no chain of links or code-span paths
from an `AGENTS.md` reaches, and each link to a missing file. The agent also reads the fix commits of the last 200 commits, or of the number
that `--commits` gives, and a mistake that the fixes repeat becomes a candidate. With `--path`, it
reads only the commits that change that folder.
The agent shows the candidates and writes nothing until you approve them. When no human can
approve, the agent stops at the candidates.

In an interactive terminal, `harden` offers the same resolution menu as Doctor: hand off to an
installed coding agent seeded with the prompt, copy the prompt, or do nothing. After a handoff,
`harden` runs `check`, then the Doctor assessment, and exits 1 when either fails.
During the session, the agent verifies each new or changed custom rule with temporary
RuleTester cases and removes the cases before handback.
Harden also exits 1 when the session added a link to a Markdown file that does not exist. A copy or "do nothing"
exits 0 without verification. Without a terminal, it prints the prompt and exits 0. `harden` never produces Doctor findings.
`harden --json` prints what the prompt is built from as one JSON document, and starts no agent.

### `adamantite update`

Update Adamantite-managed dependencies, then offer the repair of any setup findings:

```sh
adamantite update
adamantite update --json
```

`update` installs each package of the recorded setup that the project does not declare at the
managed version, such as Oxlint, tsrs, and the managed plugin of each selected preset. A version
from a pnpm catalog stays as it is, and Doctor reports an outdated catalog entry. `update` exits 1
when findings remain after it, and offers their repair as `init` does.
It also writes the managed files of the recorded setup, such as the
[Adamantite skill](#agent-skill), that are missing or unchanged since Adamantite wrote them,
and writes the lockfile again with the installed version. A project without a lockfile, such as
one that an Adamantite version before the lockfile set up, has no recorded setup, so `update`
changes nothing and reports one finding: run `adamantite init`. `init` keeps each existing file
that differs from what it writes, and Doctor then reports the changes that break the setup.

### `adamantite rule`

Write, try, and inspect [custom rules](#custom-rules) and other Oxlint rules:

```sh
adamantite rule add no-process-env
adamantite rule add no-window --dir tooling/lint/rules
adamantite rule test add
adamantite rule test add no-process-env
adamantite rule test add no-process-env --path tests/no-process-env.test.ts
adamantite rule test
adamantite rule test --path tests/no-process-env.test.ts
adamantite rule try no-console --report src/debug.ts --accept src/index.ts
adamantite rule try no-restricted-imports --options '[{"paths":["node:fs"]}]' --report src/new.ts=draft.ts
adamantite rule try project/no-process-env --current --report src/env.ts
adamantite rule ast src/index.ts
```

`rule add` writes only a rule stub to `.adamantite/lint/`, or to the folder that `--dir` names.
Agents verify it with temporary `RuleTester` cases by default. `rule test add` lists existing
rules for selection. Pass a rule name to skip the list; the command fails if the rule does not
exist. It writes an optional `<name>.test.ts` beside the rule, or at the file path that `--path`
names. `--dir` selects another rules folder. It preserves existing files. Adapt the generated
valid and invalid cases to the rule before running them.

`rule test` runs saved `.test.*` files beside the rules that `custom()` loads. Use
`rule test --path <file>` for a test saved elsewhere. CI and harden do not run saved tests
automatically. Agents remove their temporary verification cases before they finish.
During harden, agents can use `rule test add` to prepare those temporary cases and
`rule test --path <file>` to run them. They preserve user-owned saved tests.

`rule try` runs a trial. It lints cases with one rule and shows whether the rule reports or
accepts each case. Give the full rule name, such as `no-console`, `typescript/no-explicit-any`,
or `project/no-process-env`. Each `--report` adds a case that the rule must report, and each
`--accept` adds a case that the rule must accept. A trial needs at least one `--report` case.
Repeat either flag to add more cases.

Run `rule try` from the project root. A case is a file path relative to the project root. Use
`<path>=<file>` to lint the content of `<file>` as if it were at `<path>`. This form lets you try
code that is not in the project yet, and code in files that git ignores.

By default, the trial sets the rule to `error` with no options. `--options` gives the options
that come after the severity, as a JSON array. `--current` uses the rule setting from the
project config instead. You cannot use `--options` and `--current` together.

The trial lints a copy of the project in a temporary folder, so it does not change the project.
It exits 0 when every case gives the expected result, 1 when a case does not, and 2 when the
trial cannot check the cases, such as for a rule that does not exist.

`rule ast` prints the ESTree-shaped AST that Oxlint rules visit, so you can read node names off
real code. Oxlint parses the file, so the project needs Oxlint installed.

`rule try --json` and `rule ast --json` print the trial results and the tree as one JSON document.

### JSON output

`doctor`, `harden`, `init`, `update`, `rule ast`, and `rule try` take `--json`. Each one prints one
JSON document on standard output, and its other lines on standard error. With `--json`, a command
never asks a question and never starts an agent. The exit codes stay the same. Each document has a
`schemaVersion`:

| Command          | Document                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `doctor`         | The `selection`, or `null` when the lockfile does not read, the applicable integrations, the `findings`, the `warnings`, and the `packageActions`. |
| `harden`         | The configs, rules folders, instructions, documentation, agent reach, suppressions, override trials, scope, and commits of the prompt.             |
| `init`, `update` | The `setup`: the file writes, the script writes, the installs, and the lockfile write. The `assessment` of the project after it.                   |
| `rule ast`       | The `file` and its `program`.                                                                                                                      |
| `rule try`       | The `rule`, the `setting` of the trial, and the `results` of each case.                                                                            |

Each finding keeps its `id`, `integration`, `title`, `currentState`, and `goal`, and its `notes`
and `reference` when it has them. The `setup` of `update` is `null` in a project that has no
lockfile and no setup to record.

### Pass arguments to underlying tools

Commands that invoke Knip, Oxlint, Oxfmt, or Sherif forward arguments after `--`:

```sh
adamantite analyze --strict -- --directory packages/app
adamantite check src -- --format github
adamantite analyze --only monorepo -- --ignore-package package-a
```

Package managers consume one separator, so package scripts need a second one:

```sh
bun run analyze -- -- --directory packages/app
npm run analyze -- -- --directory packages/app
```

`init`, `doctor`, `harden`, and `update` do not forward arguments because they do not invoke one
underlying CLI.

## Presets

Adamantite publishes configuration that can also be consumed directly. The package exports only
the imports in this table, and Node.js rejects any other path in the package:

| Export                         | Purpose                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `adamantite/lint`              | Core Oxlint rules, including Node.js callbacks and CommonJS modules.                                                                                                                                                                                                                       |
| `adamantite/lint/react`        | React, JSX accessibility, and performance.                                                                                                                                                                                                                                                 |
| `adamantite/lint/react-strict` | React feature-code restrictions and curated [React Doctor](https://github.com/millionco/react-doctor) checks for state, effects, cleanup, and render lifetimes. See [the react-strict preset](#the-react-strict-preset).                                                                   |
| `adamantite/lint/tanstack`     | Opinions for [TanStack Query](https://tanstack.com/query) with route loaders: queries defined once with `queryOptions()`, and no query data copied into state. See [the tanstack preset](#the-tanstack-preset).                                                                            |
| `adamantite/lint/nextjs`       | Next.js rules.                                                                                                                                                                                                                                                                             |
| `adamantite/lint/vue`          | Vue rules.                                                                                                                                                                                                                                                                                 |
| `adamantite/lint/effect`       | Curated [@effect/tsgo](https://github.com/Effect-TS/tsgo) rules for Effect misuse, such as effects that never run and unhandled errors, and [anti-slop](https://github.com/dmmulroy/anti-slop) rules for tagged values. See [the effect preset](#the-effect-preset).                       |
| `adamantite/lint/jest`         | Jest rules for test files. See [the jest and vitest presets](#the-jest-and-vitest-presets).                                                                                                                                                                                                |
| `adamantite/lint/vitest`       | Vitest rules for test files. See [the jest and vitest presets](#the-jest-and-vitest-presets).                                                                                                                                                                                              |
| `adamantite/lint/architecture` | Load first-party rules for project-defined layer maps and import owners. No rules are enabled by default.                                                                                                                                                                                  |
| `adamantite/lint/strict`       | Framework-neutral opinions: no type assertions outside tests, no `unknown` in signatures, no module mocks, no deep or wide destructuring, a reason on each suppression, no console calls, and no task comments. See [the strict preset](#the-strict-preset).                               |
| `adamantite/lint/tailwind`     | [@shadcn/lint](https://github.com/shadcn-ui/lint) rules for Tailwind v4 design systems: no restyled components, raw colors, arbitrary values, inline styles, unknown classes, or unreadable class expressions. shadcn/ui is not required. See [the tailwind preset](#the-tailwind-preset). |
| `adamantite/rules`             | A function, `custom()`, that loads the project's own rules from `.adamantite/lint/`. See [custom rules](#custom-rules).                                                                                                                                                                    |
| `adamantite/rules/plugin`      | `definePlugin`, `defineRule`, and all Oxlint authoring types.                                                                                                                                                                                                                              |
| `adamantite/rules/testing`     | `RuleTester` and its types for temporary agent verification and optional saved tests.                                                                                                                                                                                                      |
| `adamantite/format`            | Oxfmt configuration. Formats Astro files with Astro 7 and later, and Svelte files with Svelte 5 and later.                                                                                                                                                                                 |
| `adamantite/analyze`           | Knip configuration. The `ignoreDependencies` named export groups suggested ignore lists; `init` sets `ignoreDependencies.monorepo` in a monorepo and `ignoreDependencies.effect` with the effect preset.                                                                                   |
| `adamantite/typescript`        | Strict TypeScript configuration for TS 7+, with [ts-reset](https://github.com/total-typescript/ts-reset) types: `JSON.parse()` and `response.json()` return `unknown`. Allows only erasable syntax. Not for libraries. See [the TypeScript presets](#the-typescript-presets).              |
| `adamantite/tsconfig`          | The strict options of `adamantite/typescript` without the ts-reset types, for libraries. See [the TypeScript presets](#the-typescript-presets).                                                                                                                                            |

When consuming the lint presets directly, hoist the core preset's ignore patterns onto the
root config. Oxlint does not merge `ignorePatterns` from extended configs, so without the
hoist, dependencies, build output, and generated code are only skipped when your
`.gitignore` happens to cover them:

```ts
import core from "adamantite/lint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns,
})
```

Configs generated by `adamantite init` include this automatically.

The core preset changes three rules for some files:

- `no-redeclare` is off in TypeScript files, where a type and a value can share a name, such as
  `const Port` and `type Port`. The type check reports a value that is declared two times.
- `import/unambiguous` is off in declaration files and in Astro, Vue, and Svelte files. A
  declaration file without an `import` or `export` is a script on purpose, and these frameworks
  compile a script block as a module.
- `jsdoc/check-tag-names` accepts JSDoc type tags, such as `@type`, in JavaScript files, which
  have no type syntax.

To change one of these rules for these files, use an `overrides` entry. See
[change a rule that a preset sets for some files](#change-a-rule-that-a-preset-sets-for-some-files).

List the core preset one time in `extends`, before the other Adamantite presets. Oxlint applies
the entries in order, and a later entry replaces the rules of an earlier one. Some presets, such as
strict and effect, change rules of core, and core replaces those changes when it comes after the
preset. Doctor reports an Adamantite preset that comes before a core entry.

The core preset reports an `oxlint-disable` or `eslint-disable` comment that suppresses nothing,
and `adamantite fix` removes the comment. The Zed and VS Code setups report it with the same
severity. Oxlint reads this setting, `options.reportUnusedDisableDirectives`, only from the root
config. To change it, set it in the root `oxlint.config.ts`.

### Explicit undefined results

The core preset enables `unicorn/no-useless-undefined` with `checkArguments: false` and
`checkArrowFunctionBody: false`. It preserves `consume(undefined)` and `() => undefined`.
The `no-empty-function`, `array-callback-return`, and `no-useless-return` rules stay enabled.
With the effect preset, `Effect.succeed(undefined)` still gets the Effect rule that recommends
`Effect.undefined`.

For a simple optional result, use an expression callback. For a block callback that returns
`undefined`, declare a union result type that includes its other possible results:

```ts
declare const flags: boolean[]

export const expression = flags.map((flag) => (flag ? 1 : undefined))

export const mapped = flags.map((flag): number | undefined => {
  if (flag) {
    return 1
  }

  return undefined
})
```

The rule preserves `return undefined` in a function with an explicit return type other than
`void` or `undefined`. A `: undefined` annotation alone does not preserve a block return.
An unannotated `return undefined` can still get a fix that writes a bare `return`, which the
callback-return or redundant-return checks reject. Change that callback to one of the forms
above before running `adamantite fix`. The rule still reports redundant initializers and yields.

### Change a rule that a preset sets for some files

Some presets set rules for some files in an `overrides` entry. Oxlint applies the settings in this
order, and a later setting replaces an earlier one:

1. The top-level `rules` of each `extends` entry, in the order of `extends`.
2. The top-level `rules` of your config.
3. The `overrides` of each `extends` entry.
4. The `overrides` of your config.

So a setting in your top-level `rules` has no effect on a rule that a preset sets in an override,
for the files of that override. Oxlint does not tell you that the setting has no effect. These
presets set rules in an override:

| Preset           | Files                                                     | Rules                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`           | `**/*.{ts,tsx,mts,cts}`                                   | `no-redeclare`                                                                                                                                                                                                               |
| `core`           | `**/*.d.{ts,mts,cts}` and `**/*.{astro,vue,svelte}`       | `import/unambiguous`                                                                                                                                                                                                         |
| `core`           | `**/*.{js,jsx,mjs,cjs}`                                   | `jsdoc/check-tag-names`                                                                                                                                                                                                      |
| `strict`         | `**/*.d.{ts,mts,cts}`                                     | `quality/no-object-parameters`, `quality/no-unknown-parameters`, `quality/no-unknown-returns`, and `quality/no-unsafe-dictionary-type`                                                                                       |
| `strict`         | `**/*.{test,spec}.{ts,tsx,mts,cts}` and `**/__tests__/**` | `quality/no-chained-type-assertions`, `quality/no-widen-then-assert`, `quality/require-safety-comment-for-type-assertion`, `testing/no-fixed-sleep`, `testing/no-flake-masking`, and `typescript/consistent-type-assertions` |
| `strict`         | `**/{vite,vitest}.config.{js,mjs,cjs,ts,mts,cts}`         | `testing/no-flake-masking`                                                                                                                                                                                                   |
| `tailwind`       | `**/components/ui/**`                                     | `shadcn/no-arbitrary-values`, `shadcn/no-restyle`, and `shadcn/require-static-classes`                                                                                                                                       |
| `jest`, `vitest` | The preset's `testFiles`                                  | All rules of the preset. See [the jest and vitest presets](#the-jest-and-vitest-presets).                                                                                                                                    |

To change one of these rules for these files, set it in an `overrides` entry of your config with
the same files. For example, this config turns off the `SAFETY:` comment rule of strict in test
files:

```ts
import core from "adamantite/lint"
import strict from "adamantite/lint/strict"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, strict],
  ignorePatterns: core.ignorePatterns,
  overrides: [
    {
      files: ["**/*.{test,spec}.{ts,tsx,mts,cts}", "**/__tests__/**"],
      rules: { "quality/require-safety-comment-for-type-assertion": "off" },
    },
  ],
})
```

An override that changes a `jest/*` or `vitest/*` rule must also set `plugins: jest.plugins` or
`plugins: vitest.plugins`. Oxlint ignores these rules in an override that does not enable their
plugin.

### The TypeScript presets

`adamantite/tsconfig` sets strict compiler options for TypeScript 7 and later. It allows only
erasable syntax, so `enum`, a `namespace` with values, and parameter properties fail type checking.

`adamantite/typescript` adds type resets to the same options, so built-in APIs return safer
types. For example, `JSON.parse()`, `response.json()`, and property reads on `localStorage` return
`unknown` instead of `any`, and `includes()` on a literal array accepts a wider value. The project
needs no `reset.d.ts` file and no dependency, because the preset loads the resets from the
Adamantite package. The resets started from
[ts-reset](https://github.com/total-typescript/ts-reset) by Matt Pocock. See [credits](#credits).

The resets also cover built-in APIs that ts-reset leaves as `any`. `Object.values()` and
`Object.entries()` on a type without an index signature, `Object.assign()` with more than three
sources, `Object.getPrototypeOf()`, `Reflect.apply()`, `Reflect.construct()`, `eval()`, and the
values of a `JSON.parse()` reviver return or take `unknown`. TypeScript cannot change a property type or a
default type parameter by declaration merging, so `PromiseRejectedResult.reason` and
`MessageEvent` data stay `any`.

```json
{ "extends": "adamantite/typescript" }
```

Use `adamantite/tsconfig` in a library that publishes declaration files. A declaration file that
TypeScript emits with the type resets can name the global `AdamantiteTypeScript` helper types,
which a consumer without the resets does not have. Doctor reports a package whose
`tsconfig.json` loads the type resets, directly or through a base config, when the package is not
private and declares `exports` or `types`. Doctor asks the project's TypeScript with
`tsc --showConfig`.

The preset adds the type resets through `files`, and includes every file below your
`tsconfig.json` through `include`. List your files in `include`, which keeps the resets. A `files`
list in your `tsconfig.json` replaces the preset's list, so it drops the resets, and the config
still inherits the preset's `include`. A config that must check only its `files`, such as a
solution config with `"files": []` and `references`, sets `"include": []` too, or extends
`adamantite/tsconfig`. To use the strict options without the type resets, extend
`adamantite/tsconfig`.

### The jest and vitest presets

The `jest` and `vitest` presets apply their rules only to test files, so rules such as
`vitest/require-hook` do not report scripts and library code. Each preset exports `testFiles`, the
files that its test runner runs as tests by default. `vitest` `testFiles` match `*.test.*` and
`*.spec.*` files. `jest` `testFiles` also match files in `__tests__` folders.

Select one of the two presets. They report the same test defects, so a config that extends both
gets two reports for each defect. Init accepts only one of them, and `adamantite doctor` reports a
config that extends both. If one package runs both test runners, use each preset in an override
with files that do not overlap.

Extend the preset to use these files:

```ts
import core from "adamantite/lint"
import vitest from "adamantite/lint/vitest"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, vitest],
  ignorePatterns: core.ignorePatterns,
})
```

If your test runner finds tests in other files, use the preset in an override of your own
instead of `extends`. `vitest.plugins` and `vitest.rules` hold the preset's plugins and rules:

```ts
import core from "adamantite/lint"
import vitest, { testFiles } from "adamantite/lint/vitest"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns,
  overrides: [
    {
      files: [...testFiles, "e2e/**/*.ts"],
      plugins: vitest.plugins,
      rules: { ...vitest.rules, "vitest/max-expects": "off" },
    },
  ],
})
```

Change a test rule in an override, not in the top-level `rules`: the preset's rules for test files
replace top-level settings. See
[change a rule that a preset sets for some files](#change-a-rule-that-a-preset-sets-for-some-files).
Keep `plugins: vitest.plugins` in that override too, because Oxlint ignores the `vitest/*` rules
of an override that does not enable the `vitest` plugin.

Both presets accept a describe title that starts with a capital letter, such as
`describe("Calculator", ...)`, because the title often names the class or function under test.
They report a test title that starts with a capital letter.

Both presets accept a top-level `tester.run(...)` call in `require-hook`. A RuleTester test, such
as the one that `adamantite rule test add` writes, registers its suites with that call.

### The react-strict preset

`adamantite/lint/react-strict` keeps state and side effects out of React feature code. Use
it together with `adamantite/lint/react`. It loads Adamantite's first-party plugin and the
managed `oxlint-plugin-react-doctor` package. Init installs the pinned package when you
select `react-strict`. Doctor and update maintain its version.

`adamantite/no-react-state-hooks` reports calls to `useState`, `useReducer`, `useEffect`,
`useLayoutEffect`, `useSyncExternalStore`, `useMemo`, and `useCallback` imported from
`react`, including aliased imports and `React.useState(...)`. Each message tells what to do
instead: derive state from loader data or URL params, move side effects to loaders, actions,
or event handlers, and let the React Compiler memoize. For the opinions that do not depend
on React, add [the strict preset](#the-strict-preset).

Hooks stay allowed in hook modules: files that match `**/use-*.{ts,tsx}`, `**/hooks.{ts,tsx}`,
or `**/hooks/**`, such as `use-cart.ts` or `cart/hooks.ts`. Each of these names passes the
kebab-case check of the core preset. A file such as `useCart.ts` is feature code.
Globs match paths relative to the working directory. Set `allow` to use another layout, and
`hooks` to change the list of reported hooks:

```ts
import core from "adamantite/lint"
import react from "adamantite/lint/react"
import reactStrict from "adamantite/lint/react-strict"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, react, reactStrict],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "adamantite/no-react-state-hooks": [
      "error",
      { allow: ["src/state/**", "**/use-*.{ts,tsx}"], hooks: ["useState", "useEffect"] },
    ],
  },
})
```

Each option replaces its default list.

`adamantite/require-effect-dependencies` reports a call to `useEffect`, `useLayoutEffect`, or
`useInsertionEffect` from `react` that passes no dependency array, or passes `undefined` or `null`,
because React then runs the effect after every render. Pass the values that the effect reads, or
`[]` when it reads none. The rule reports these calls in hook modules too, where
`adamantite/no-react-state-hooks` allows effects.

The React Doctor package exports more than 900 rules. The preset enables only rules that run on one file
and that the native `react`, `react-hooks`, `jsx-a11y`, and `unicorn` rules do not already
report. Examples are an effect that does the work of an event handler (`no-effect-event-handler`), data fetched in an effect
(`no-fetch-in-effect`), and state changed in place (`no-direct-state-mutation`). It also
checks cleanup, stale timer references, discarded effect cleanup callbacks, loading flags
that stay set after a failed request, and contexts or object URLs created during render. The
TanStack Query and TanStack Start rules are not in this preset.

React Doctor checks also run in hook modules where state and effect hooks are allowed.
Some React Doctor rules
skip test files and fixtures by path, such as `__tests__/` and `*.test.tsx`.

`oxlint-plugin-react-doctor` has a modified MIT license. It needs written permission from
the copyright holder to use the software as machine learning training data, or to sell it
as a hosted product. Read the
[license](https://www.npmjs.com/package/oxlint-plugin-react-doctor?activeTab=code) before
you select the preset.

If you add `react-strict` by hand, install `oxlint-plugin-react-doctor` as a devDependency.

### The tanstack preset

`adamantite/lint/tanstack` holds opinions for TanStack Query (`@tanstack/react-query`) in
apps that preload queries in route loaders, such as TanStack Router and TanStack Start apps.
It needs no extra package.

- `adamantite/query-from-loader` reports `useQuery`, `useSuspenseQuery`, `useInfiniteQuery`,
  and `useSuspenseInfiniteQuery` calls in route files that take a plain options object or a `queryOptions()`
  call made inside a function. Define each query once with `queryOptions()` at module scope
  or in an exported factory such as `userQuery(id)`, preload it in the route loader with
  `queryClient.ensureQueryData()`, and pass the same options to the hook. For the infinite
  hooks, use `infiniteQueryOptions()` and `queryClient.ensureInfiniteQueryData()`. The rule
  looks through type-only wrappers such as `as const` and `satisfies`. Then a route with
  `preload="intent"` renders from the cache without a request waterfall. An object that
  spreads shared options, such as `{ ...userQuery(id), select }`, stays allowed.
- `adamantite/no-query-data-in-state` reports `useState` calls whose initial value comes from
  the data of a query in the same component, such as `useState(query.data)` or
  `useState(() => data.user)`. The copy stops updating when the query refetches. Read the
  value from the query result, and keep only the user's edits in state.

A route file is a file that calls a route factory from `@tanstack/react-router`, such as
`createFileRoute`, `createRootRoute`, or `createRoute`. Only a route has a loader to preload
the query, so components outside route files can define their queries inline.
`query-from-loader` checks one file at a time. It cannot prove that a loader preloads the
options, so it moves queries toward shared definitions but does not guarantee the preload.
Query refetches from effects and mutation invalidation are not checked by these presets.

### The effect preset

`adamantite/lint/effect` reports misuse of [Effect](https://effect.website), such as an
effect that is neither yielded nor assigned (`floating-effect`), an unhandled error or
requirement (`missing-effect-error`, `missing-effect-context`), and a combinator with a
simpler replacement (`catch-all-to-map-error`). The rules come from
[@effect/tsgo](https://github.com/Effect-TS/tsgo), the Effect Language Service for
TypeScript-Go, and need Oxlint's type-aware mode.

The preset also turns on the rules of the `quality-effect` plugin. The rules started as a copy of
[anti-slop](https://github.com/dmmulroy/anti-slop), and Adamantite now maintains them under its
`quality-effect/*` names, so nothing extra needs to be installed. The rules report tagged values
that code handles by hand:

- `no-manual-tagged-construction` reports an object literal with a `_tag`. Use a tagged class,
  such as `Data.TaggedClass` or `Data.TaggedError`, or the `make` of a tagged Schema.
- `no-manual-tag-comparison` reports a comparison or a `switch` on `_tag`. Use `Match.tag`,
  `Predicate.isTagged`, or a helper such as `Option.isNone`.
- `no-manual-effect-error-tag` reports a broad `Effect.catch` handler that branches on `_tag`.
  Use `Effect.catchTag` or `Effect.catchReason`.
- `prefer-effect-match` reports a chain of ternaries that compare one value with literals. Use
  `Match` or a lookup table.
- `no-service-constructor-imports` reports a `make*` import from a project file outside tests.
  Import the Layer of the service instead.

The preset turns off two core rules, `unicorn/no-array-callback-reference` and
`unicorn/no-array-method-this-argument`. They match an array method by its name only, so they
report Effect calls such as `Option.some(value)` and `Array.findLast(values, predicate)`.

The preset also turns off the core rule `unicorn/throw-new-error`, until Oxlint fixes
[oxc-project/oxc#27718](https://github.com/oxc-project/oxc/issues/27718). The rule reports an error
class that `Schema.TaggedError` or `Schema.Error` makes, and its fix adds a `new` that breaks the
class.

The `@effect/tsgo` rules are not a JavaScript plugin. They exist only in the Effect builds of the Oxlint
binding and tsrs, which `@effect/tsgo` ships. When the project installs
`@effect/tsgo`, Adamantite runs Oxlint with those builds. Nothing changes in
installed package files, so linting needs no install script. These run Oxlint with the builds:

- `adamantite check`, `adamantite fix`, and `adamantite harden`.
- VS Code and Zed, through the settings that `adamantite init` writes. They start
  `node_modules/adamantite/dist/oxlint.js` in place of `oxlint`.

A plain `oxlint` call, such as in a lint-staged config, stops with
`Unknown plugin: 'effecttsgo'`. Run `adamantite check --only lint` instead, which also takes
file arguments.

When you select the preset, `adamantite init` does these steps:

- Installs the pinned `@effect/tsgo`.
- Adds `{ "name": "@effect/language-service", "diagnostics": true }` to
  `compilerOptions.plugins` in `tsconfig.json`. The rules read their options from this entry.
  The Effect language server needs diagnostics enabled to offer semantic quick fixes.
- Configures the selected editors to use the installed Effect language server. Their Oxlint
  settings hide duplicate Effect rule reports. CLI Oxlint keeps the effect preset.
- Sets `ignoreDependencies.effect` in `knip.config.ts`, because no package has the name
  `@effect/language-service`.

`adamantite doctor` reports each missing part, and `adamantite update` keeps
`@effect/tsgo` on its pinned version. Each `@effect/tsgo` release has Effect builds only for
some Oxlint and tsrs versions, so Adamantite moves the pins together. With an
Oxlint or tsrs version that the pinned `@effect/tsgo` has no build of, Oxlint
does not start, and the message names the versions that it supports. `@effect/tsgo` has no
builds for Linux with musl.

VS Code uses a copy of the Effect compiler and its standard libraries in
`node_modules/.cache/adamantite/effect/`. Init creates this cache without changing installed
package files. Zed starts the project's installed `effect-tsgo` CLI with `tsc --lsp --stdio`.
Both use a native TypeScript version that the installed `@effect/tsgo` supports.

To upgrade an existing editor setup, run:

```sh
adamantite update
adamantite init --non-interactive --script check --preset effect --editor vscode --editor zed
```

`.vscode/extensions.json` recommends the TypeScript 7 extension for VS Code.
In VS Code, run **TypeScript: Select TypeScript Version...**, then select **Use Workspace Version**
to use the Effect SDK. Install Zed's TypeScript language server extension (`zed://extension/tsgo`);
the managed server ID is `typescript-ls`.

After a fresh dependency install, run `adamantite update` to prepare or refresh the SDK cache.
Doctor reports missing editor settings and a missing, incomplete, or stale SDK. It does not
write files. Install scripts can stay disabled.

The rules read their options from the tsconfig entry. For example, `unstable-api-usage`
reports each use of an API marked `@stability unstable`. To allow a module on purpose, list
it in `allowedUnstableApis`:

```jsonc
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@effect/language-service",
        "diagnostics": true,
        "allowedUnstableApis": ["effect/cli"],
      },
    ],
  },
}
```

Effect 4.0.2 and later tag each module as stable or unstable. Unstable modules can have
breaking changes in minor releases. The unstable modules include the platform modules, such
as `effect/FileSystem`, `effect/Path`, and `effect/Terminal`, and all modules in
`@effect/platform-node` and `@effect/vitest`. A project that uses them must list them. An
entry can be a module, such as `effect/Path`, or a full package, such as `@effect/vitest`.

The preset enables only rules that report Effect code. It does not ban platform APIs, such
as `Date.now()` or `process.env`, in code that is not Effect code. Inside Effect code, it
reports them, because `Clock`, `Random`, and `Config` let tests control them.

### The architecture preset

`adamantite/lint/architecture` loads the first-party plugin without enabling any rules.
Use it to configure `adamantite/layers` and `adamantite/import-owners` without the other
rules of `strict`. It needs no extra package. The `strict` preset still loads the same plugin.

```ts
import core from "adamantite/lint"
import architecture from "adamantite/lint/architecture"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, architecture],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "adamantite/layers": [
      "error",
      {
        root: "src/lib",
        layers: {
          shared: { imports: [] },
          services: { imports: ["shared"] },
        },
      },
    ],
    "adamantite/import-owners": [
      "error",
      { import: "giget", owners: ["src/lib/services/download.ts"] },
    ],
  },
})
```

Each option after the severity is one layer map or one import and its owners. Set these
options for your project. The preset enables neither rule by default.

Each layer's `imports` list names siblings, and permissions are transitive. Put a child map
in that layer's `layers` property. Its root derives from the containing folder, and its
settings remain local. Every containing map checks the file independently.

Doctor warns when an Oxlint config states import layers by hand, in two or more
`no-restricted-imports` overrides with `patterns`. The warning names the config and gives the
steps that move those overrides into layer maps. A warning fails no Doctor gate, so Doctor still
exits 0 when nothing else remains.

Both rules find an imported file by its real path, so a symlink cannot reach a higher layer or an
owned module by another path. A path through `node_modules` keeps its package, so a bare import of
a linked workspace package matches the package name, and stays outside every layer map.

You can also select it during setup with
`adamantite init --non-interactive --script check --preset architecture`.

### The strict preset

`adamantite/lint/strict` holds framework-neutral opinions. Use it with any other preset.
It needs no extra package. Most of its type rules started as
[anti-slop](https://github.com/dmmulroy/anti-slop) rules, which Adamantite now maintains under the
`quality/*` names.

- `adamantite/no-overzealous-destructuring` reports destructuring patterns nested more than
  `maxDepth` levels deep (default 2), such as `const { data: { user: { name } } } = query`,
  and object patterns that take more than `maxProperties` properties (default 5). A rest
  element does not count. Keep the object and read its members, or split the pattern.
- `typescript/consistent-type-assertions` bans type assertions. `as const` stays allowed,
  and test files (`*.test.*`, `*.spec.*`, and `__tests__/`) keep the core preset's setting.
- `no-console` reports a console call other than `console.info`.
- `adamantite/require-suppression-reason` reports an `oxlint-disable` or `eslint-disable`
  comment, including the `-line` and `-next-line` forms, that gives no reason after `--`,
  such as `// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. A
  comment that names no rule is reported by the core preset's `unicorn/no-abusive-eslint-disable`.
- `no-warning-comments` reports a comment that starts with `TODO`, `FIXME`, `XXX`, or `HACK`.
  Fix the code now, or track the work in your issue tracker. Do not only rename the marker.
- The quality rules ask the code to decode input at its boundary into types that it owns.
  They report `unknown` in function signatures and type aliases, loose dictionary types, a
  `typeof` check outside a type predicate, and `Reflect.get` and `Reflect.apply`. They also report adjacent `filter` and `map` passes, a `reduce` that copies its
  accumulator, `shape` in symbol names, and a missing blank line between statement groups.
- `quality/no-unsafe-dictionary-type` reports a named dictionary such as
  `Record<string, unknown>` at its declaration, not at each use. Some types accept open fields on
  purpose, such as the fields that each caller adds to a log event. Name that field bag once, and
  suppress the rule at its declaration with a reason:

  ```ts
  // oxlint-disable-next-line quality/no-unsafe-dictionary-type -- each caller adds its own log fields
  type LogFields = Record<string, unknown>

  export type Logger = {
    info: (event: LogFields) => void
    error: (event: LogFields) => void
  }
  ```

- `quality/require-readable-spacing` adds blank lines around a statement that spans several
  lines. `adamantite fix` runs lint before Oxfmt, so the rule also counts a one-line statement
  that ends past column 100 as multiline, because Oxfmt wraps it. A line that Oxfmt cannot
  wrap, such as a long template literal, also gets blank lines. If your Oxfmt config sets
  another `printWidth`, set the rule's `printWidth` option to the same value.
- In test files, where type assertions are allowed, `quality/require-safety-comment-for-type-assertion`
  requires a `SAFETY:` comment on each assertion, and `quality/no-chained-type-assertions` and
  `quality/no-widen-then-assert` report assertions that hide the source type. Outside tests,
  `typescript/consistent-type-assertions` is the only rule that reports an assertion. To change
  one of these rules in test files, use an `overrides` entry. See
  [change a rule that a preset sets for some files](#change-a-rule-that-a-preset-sets-for-some-files).
- `testing/no-doubles` reports a Vitest or Jest test double that replaces what a dependency does:
  a module mock, such as `vi.mock("./store")`, a mock implementation, such as `vi.fn(() => 1)`,
  `mockReturnValue(1)`, or `vi.when(spy).calledWith(1).thenReturn(2)`, and a stubbed global, such as `vi.stubGlobal("fetch", fake)`. It also
  finds `vi` and `jest` through a namespace import, a destructured method, or a `const` alias. A
  test replaces a dependency through its interface, such as an Effect `Layer` or a function
  parameter. A spy, such as `vi.spyOn(store, "save")`, and `vi.fn()` without an implementation
  only observe, so they stay allowed. The rule runs in every file, so a setup file cannot mock a
  module for every test either. The jest and vitest presets turn off `prefer-mock-promise-shorthand`
  and `prefer-mock-return-shorthand`, which ask for `mockResolvedValue` and `mockReturnValue`.
- In test files, `testing/no-flake-masking` reports a test retry and a raised test timeout. A
  test that passes only on a retry is flaky, and a raised timeout hides a slow or stuck test. The
  rule reports a `retry` or `timeout` option of a test or suite, a timeout after the test
  function, such as `it("loads", fn, 60_000)`, `vi.setConfig()` with `retry`, `testTimeout`, or
  `hookTimeout`, `jest.retryTimes()`, `jest.setTimeout()`, and `flakyTest` of `@effect/vitest`.
  In a Vite or Vitest config, it reports `retry` in the `test` options. A hook timeout, a timeout
  of `expect.poll` or `vi.waitFor`, a `testTimeout` in the config, and a timeout in a benchmark
  file, such as `index.bench.ts`, stay allowed. Await the
  event that the test depends on, or control time with `TestClock` or fake timers. The rule
  started as a copy of the [landmines](https://github.com/interfere-inc/landmines) rule.
- In test files, `testing/no-fixed-sleep` reports a fixed sleep in the body of a test or a hook,
  such as `await new Promise((resolve) => setTimeout(resolve, 100))`, `await setTimeout(100)` of
  `node:timers/promises`, `scheduler.wait()`, `Bun.sleep()`, and `yield* Effect.sleep()` in the
  generator of an Effect test. A sleep guesses how long the work takes, and fails under load.
  Await the operation, or a promise that its handler resolves. A file that uses fake timers or
  `TestClock` moves time without waiting, so the rule reports nothing in it. A sleep in a helper
  or a handler, such as simulated latency in a mock server, stays allowed.
- In declaration files (`*.d.ts`), the preset turns off `quality/no-unknown-parameters`,
  `quality/no-unknown-returns`, `quality/no-object-parameters`, and
  `quality/no-unsafe-dictionary-type`. A declaration file states the types of code that it does
  not hold, such as a built-in API or a package without types. To turn one of these rules on in
  declaration files, use an `overrides` entry.
- The preset turns off the core preset's `typescript/consistent-indexed-object-style` and
  `unicorn/no-immediate-mutation`, which conflict with `quality/no-known-value-widening`.
- The help of three core rules recommends a form that strict reports. `typescript/no-explicit-any`
  recommends `unknown`, `typescript/no-wrapper-object-types` recommends `object` and its autofix
  writes it, and `unicorn/no-instanceof-builtins` recommends `typeof`. The help belongs to the
  upstream rules, so the preset cannot change it. Follow the strict report that comes next. It
  names a form that both presets accept, such as a named domain type that you parse at the
  boundary.

Set `maxDepth` and `maxProperties` to change the destructuring limits, and `printWidth` to
match an Oxfmt `printWidth` other than 100:

```ts
import core from "adamantite/lint"
import strict from "adamantite/lint/strict"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, strict],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "adamantite/no-overzealous-destructuring": ["error", { maxDepth: 1, maxProperties: 3 }],
    "quality/require-readable-spacing": ["error", { printWidth: 120 }],
  },
})
```

### The Tailwind preset

The preset uses upstream `shadcn/*` rule names and `settings.shadcn` keys.

`adamantite/lint/tailwind` needs Tailwind v4 and the `@shadcn/lint` package. `adamantite init`
installs the pinned version when you select the preset, and `adamantite doctor` and
`adamantite update` keep it on that version. If you add the preset by hand, install
`@shadcn/lint` as a devDependency too. The plugin finds your components and theme
through `components.json`. Without that file it looks for components in `components/ui`
or `src/components/ui` and discovers the stylesheet that imports Tailwind. When your
components live elsewhere, set `settings.shadcn.ui`:

```ts
import core from "adamantite/lint"
import tailwind from "adamantite/lint/tailwind"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, tailwind],
  ignorePatterns: core.ignorePatterns,
  settings: { shadcn: { ui: "@/ds" } },
})
```

The preset allows layout classes such as `mt-4` and `w-[320px]` on components, and turns
off `no-restyle`, `no-arbitrary-values`, and `require-static-classes` under
`**/components/ui/**`, where components own their appearance. Add the same override for
another component directory. To turn one of these rules on under `**/components/ui/**`, use an
`overrides` entry, as
[change a rule that a preset sets for some files](#change-a-rule-that-a-preset-sets-for-some-files)
shows. See the [@shadcn/lint documentation](https://github.com/shadcn-ui/lint#settings) for
settings, contracts, and custom messages.

## Custom rules

Custom rules are Oxlint rules that your project writes and owns. Each rule file in
`.adamantite/lint/` is one rule. `custom()` from `adamantite/rules` loads the folder
and enables each rule as `error` under the `project` plugin, so `no-process-env.ts` becomes
`project/no-process-env`. Add a file to add a rule, and delete the file to remove it. A file
that starts with `_`, such as `_helpers.ts`, is a helper. Declaration files and optional
`.test.*` files are also excluded from plugin loading.

```text
.adamantite/lint/
  no-process-env.ts      # enabled as project/no-process-env
  no-process-env.test.ts # optional test, skipped by the plugin
  _helpers.ts            # skipped
```

```ts
// .adamantite/lint/no-process-env.ts
import { defineRule } from "adamantite/rules/plugin"

export default defineRule({
  meta: {
    messages: { unexpected: "Read configuration through the config module." },
    type: "problem",
  },
  createOnce(context) {
    return {
      MemberExpression(node) {
        if (node.object.type === "Identifier" && node.object.name === "process") {
          context.report({ messageId: "unexpected", node })
        }
      },
    }
  },
})
```

```ts
// oxlint.config.ts
import core from "adamantite/lint"
import custom from "adamantite/rules"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [core, custom()],
  ignorePatterns: core.ignorePatterns,
})
```

`custom()` returns an empty config when the folder does not exist, so `adamantite init` adds
it to every generated config. It takes these options:

- `dir`: the rules folder. A relative path resolves from the file that calls `custom()`, not
  from the working directory. Default: `.adamantite/lint`.
- `name`: the plugin name that prefixes each rule. Default: `project`.
- `rules`: severity or options for a rule, by rule name without the prefix, such as
  `{ "no-process-env": "warn" }`.

`adamantite/rules/plugin` exports `definePlugin`, `defineRule`, and the authoring types of
the Oxlint version that Adamantite pins. The package ships the types itself, so you do not need
to add `@oxlint/plugins` to your project. Use `definePlugin` from that module if you write a
plugin that you register in `jsPlugins` yourself.

Optional saved RuleTester tests use `node:test`. Exclude them from Vitest or Jest discovery
so those runners do not also try to run them. Keep the runner's default and existing
exclusions. For Vitest:

```ts
// vitest.config.ts
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ".adamantite/lint/**/*.test.*"],
  },
})
```

For Jest:

```js
// jest.config.mjs
export default {
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.adamantite/lint/"],
}
```

For another rules folder or a custom test `--path`, use its path in the exclusion. To
type-check tests that import `.ts` rule files, enable `compilerOptions.allowImportingTsExtensions`
in `tsconfig.json`. To check the hidden rules folder too, add `.adamantite/lint` to `include`.

Rule files run with Node.js type stripping, so use erasable TypeScript only: no `enum`,
`namespace` with values, or parameter properties. Rules get no type information. A rule
that throws prints an error for each file, and the lint run still exits 0. Adamantite owns
the wiring and the authoring guidance; your project owns the correctness of its rules.
Agents use `RuleTester` from `adamantite/rules/testing` to verify new and changed rules.
They run valid and invalid cases from stdin or a temporary file with Node.js, also in Bun
projects, and remove their temporary verification cases and fixtures before handback. The rules and their
runtime helpers stay in the target project. The "Custom rules" section of the
[Adamantite skill](#agent-skill) has the command and the full authoring guidance.

`adamantite doctor` reports a rules folder that no `custom()` call loads, a `dir` that names a
folder that does not exist, and two rules
folders that use the same plugin name. A rule file that cannot load stops the whole lint run, and
Doctor reports the error that Oxlint prints. User-owned saved tests and optional CI steps remain
supported.

### Custom rules in a monorepo

Oxlint rejects two plugins with the same name in one run, so give each rules folder its own
name. A nested Oxlint config replaces the root config, so a workspace package that needs the
root rules extends the root config:

```ts
// packages/web/oxlint.config.ts
import custom from "adamantite/rules"
import { defineConfig } from "oxlint"
import root from "../../oxlint.config.ts"

export default defineConfig({ extends: [root, custom({ name: "web" })] })
```

To share one rules folder across the workspace, keep it in a tooling package and call
`custom()` there. The relative `dir` resolves from the tooling package, so every config that
extends it loads the same rules:

```ts
// tooling/lint/index.ts
import custom from "adamantite/rules"

export default custom({ dir: "rules", name: "acme" })
```

Run `adamantite rule add <name> --dir tooling/lint/rules` to add a rule to that folder.
Doctor loads the Oxlint config of the root and of each workspace package with Node.js, as Oxlint
loads it, and reads the rules folder and the plugin name of each `custom()` call that the config
reaches, also through a shared tooling package. Run it after you install the dependencies. Doctor
warns about a config that does not load.

## Requirements and boundaries

- Adamantite requires Bun 1.0 or later when run with Bun, or Node.js 22.19 or later when
  run with Node.js.
- Adamantite requires TypeScript 7 or later. List `typescript` as a dependency in your own
  `package.json`. Do not rely on the copy that a package manager installs for Adamantite's
  peer dependency: npm cannot add or update a managed plugin such as `@shadcn/lint` in a
  project that has no `typescript` entry of its own.
- This repository uses pnpm and Node.js for development, but the CLI can configure
  projects that use Bun, Deno, npm, pnpm, or Yarn where the selected integration supports
  them.
- Adamantite manages recognized package scripts and supported configuration shapes. It
  reports custom configurations that require manual work instead of overwriting them.
- `fix`, `analyze --fix`, `init`, and `update` can change project files. Doctor is read-only.

## Agent skill

The Adamantite skill teaches coding agents how to initialize, assess, repair, and update a
project, what to keep after they fix a mistake so that it does not recur, and how to write
[custom rules](#custom-rules). The Adamantite package ships it.

`adamantite init` asks whether to set up coding agents. When you answer yes, or pass
`--agents` in non-interactive mode, init writes `AGENTS.md` with the Adamantite section when the
project has no `AGENTS.md`, and writes the skill to these folders. Init never edits an existing
`AGENTS.md`: Doctor reports one without the section, so you or an agent can add it.

| Skill folder     | Agents                                  | When                        |
| ---------------- | --------------------------------------- | --------------------------- |
| `.agents/skills` | Codex, Cursor, Gemini CLI, and OpenCode | Always                      |
| `.claude/skills` | Claude Code                             | The project has `.claude/`. |
| `.grok/skills`   | Grok Build                              | The project has `.grok/`.   |

The Adamantite CLI bundles the skill, so the copy matches the Adamantite version that wrote
it. Each file of the skill is a managed file: after you update Adamantite, `adamantite update`
writes the skill of the new version over each copy that nobody changed. Doctor reports a copy
that differs from the skill of the installed version, such as one that an earlier version wrote
before the lockfile. Delete that copy, and run `adamantite update`. Doctor also reports an
`adamantite` entry in `skills-lock.json`, so the `skills` CLI does not write the same folders.
Commit the skill folders, so every clone has the skill.

To install the skill from GitHub instead, with the
[`skills` CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add adelrodriguez/adamantite --list
npx skills add adelrodriguez/adamantite --skill adamantite
```

Doctor reports a copy from GitHub that differs from the skill of the installed Adamantite
version.

With pnpm 12.11 or later, `pnpm install` can also link the skill that the package ships
into the agent skill directories that exist in the project, such as `.claude/skills`,
after you approve it. pnpm creates the directory only when the agent that runs pnpm sets an
environment variable that identifies it, such as `CLAUDECODE` for `.claude/skills`.
Otherwise, if no skill directory exists, the install fails, so create one before you
approve the skill:

```sh
mkdir -p .claude/skills
pnpm approve
```

The linked skill then matches the installed Adamantite version. To choose the directories,
set `skills.dirs`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow. Contributors should
also read the [domain glossary](GLOSSARY.md) and [architecture reference](docs/architecture.md).

## Credits

Adamantite builds on the work of these people and projects.

Adamantite ships code from these projects, each with its MIT license:

- [ts-reset](https://github.com/total-typescript/ts-reset) by
  [Matt Pocock](https://github.com/mattpocock) of
  [Total TypeScript](https://www.totaltypescript.com/ts-reset). The type resets of
  `adamantite/typescript` and their tests started from it.
- [anti-slop](https://github.com/dmmulroy/anti-slop) by
  [Dillon Mulroy](https://github.com/dmmulroy), in `adamantite/lint/strict` and
  `adamantite/lint/effect`.

Adamantite configures and runs these tools:

- [Oxlint, Oxfmt, and tsrs](https://github.com/oxc-project) by
  [Boshen](https://github.com/Boshen) and the Oxc contributors.
- [Knip](https://github.com/webpro-nl/knip) by [Lars Kappert](https://github.com/webpro).
- [Sherif](https://github.com/QuiiBz/sherif) by [Tom Lienard](https://github.com/QuiiBz).
- [@effect/tsgo](https://github.com/Effect-TS/tsgo) by
  [Mattia Manzati](https://github.com/mattiamanzati) and the
  [Effect](https://github.com/Effect-TS) team.
- [React Doctor](https://github.com/millionco/react-doctor) by
  [Aiden Bai](https://github.com/aidenybai) of [Million](https://github.com/millionco).
- [@shadcn/lint](https://github.com/shadcn-ui/lint) by [shadcn](https://github.com/shadcn).
- [TypeScript](https://github.com/microsoft/TypeScript) by Microsoft.

## License

Adamantite uses the [MIT License](LICENSE).

Made with [🥐 `pastry`](https://github.com/adelrodriguez/pastry)
