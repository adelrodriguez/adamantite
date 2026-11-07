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
  - "adelrodriguez/adamantite:src/lib/execution/skill.ts"
  - "adelrodriguez/adamantite:src/lib/workspace/agents-section.md"
  - "adelrodriguez/adamantite:src/lib/workspace/custom-rules/index.ts"
  - "adelrodriguez/adamantite:src/lib/workspace/custom-rules/stub.ts.template"
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

Repeat `--script`, `--preset`, `--editor`, and `--skill-agent` for multiple values. Available
values are:

- Scripts: `check`, `fix`, `analyze`. In a detected monorepo, `analyze` also installs Sherif.
- Presets: `react`, `react-strict`, `react-doctor`, `tanstack`, `nextjs`, `vue`, `effect`, `jest`,
  `vitest`, `node`, `architecture`, `strict`, `antislop`, `shadcn`;
  editors: `vscode`, `zed`
- Skill agents: `claude-code`, `codex`, `cursor`, `gemini-cli`, `grok`, `opencode`. Init
  installs this skill for each one with the `skills` CLI.
- Optional flags: `--typescript`, `--install-extensions`, `--github-actions`, `--agents`,
  `--overwrite-scripts`

The `react-strict` preset needs no extra package. Its `adamantite/no-react-state-hooks` rule
reports React state, effect, and memoization hooks outside hook modules (`useCart.ts`,
`use-cart.ts`, and files under `hooks/`), and each message tells what to do instead. Do not move a hook call into
a hook module only to silence the rule: follow the message. Set the rule's `allow` option
when the project keeps hooks elsewhere.

The `strict` preset needs no extra package either. Its `adamantite/no-overzealous-destructuring`
rule reports destructuring nested more than 2 levels deep or object patterns with more than 5
properties; keep the object and read its members, or split the pattern. Do not raise
`maxDepth` or `maxProperties` only to silence a report. The preset also bans type assertions
outside tests.

The `strict` preset's `adamantite/require-suppression-reason` rule reports an `oxlint-disable` or
`eslint-disable` comment, including the `-line` and `-next-line` forms, that gives no reason after
`--`. A single `-` is not a reason. Before you add a reason, fix the code if you can. Write the
reason for the reader: why the rule does not apply here, not which rule it is.

```ts
// oxlint-disable-next-line no-console -- the CLI writes its report to stdout
console.log(report)
```

The `strict` preset's `no-warning-comments` rule reports a comment that starts with `TODO`,
`FIXME`, `XXX`, or `HACK`. Fix the code now, or track the work in the project's issue tracker.
Do not rename the marker or rephrase the comment only to silence the report.

The `architecture` preset loads the first-party plugin without enabling rules. The `strict`
preset also loads it. Configure `adamantite/layers` to enforce one-way imports between the
folders of a root, such as `src/lib`. The project turns it on with its layer map: each layer by
folder name, with the layers directly below it. Imports are transitive.

```ts
rules: {
  "adamantite/layers": [
    "error",
    {
      root: "src/lib", // relative to the package.json folder
      layers: { shared: [], workspace: ["shared"], execution: ["shared"], commands: ["workspace", "execution"] },
    },
  ],
},
```

`isolate` lists layers whose folders do not import each other, such as `features`. `entries`
lists composition files below the root, such as `["*"]` for `router.tsx`. `ignore` exempts
importers by glob, such as `["**/__tests__/**"]`, and `ignoreTypes: true` stops counting
type-only imports. `conditions` adds import conditions, such as the `customConditions` of
`tsconfig.json`, which the rule does not read. The rule resolves relative imports, `#` imports, and `tsconfig.json` `paths`;
an import that does not resolve is not checked. A file in a folder that is not in the map is a
report. Each option after the severity is one layer map, so the rule can take more
than one: a `src` map that keeps `lib` below `terminal`, and a `src/lib` map for the layers
inside `lib`. A file below two roots must pass both maps. Follow the repair
in each message. Do not add a layer to another layer's list, or add an `ignore` glob, only to
silence a report.

The plugin also provides `adamantite/import-owners`, which restricts an import to the files
and folders that own it, such as a wrapper module. The project turns it on: each option after the
severity is one import and its owners, by path relative to the workspace root, or to the
`package.json` folder outside a workspace. An owner folder covers every file below it, and a
module covers its subpaths, so `zod` also covers `zod/mini`. `names` restricts only some exports
of the module, and a namespace import or `export *` of that module is a report too.

```ts
rules: {
  "adamantite/import-owners": [
    "error",
    { import: "giget", owners: ["src/lib/sources/repository/fetch.ts"] },
    { import: "zod", owners: ["packages/utils"] },
    { import: "react-native", names: ["Alert"], owners: ["src/shared/alerts.ts"] },
  ],
},
```

The rule matches the import as written, so it covers packages, not files of the project: use
`adamantite/layers` for those. Use what the owner exports, or move the code into the owner. Do not
add an owner only to silence a report.

The `tanstack` preset needs no extra package. Its `adamantite/query-from-loader` rule reports
TanStack Query hooks in route files (files that call `createFileRoute`, `createRoute`, or another
route factory from `@tanstack/react-router`) that take a plain options object or a `queryOptions()` call made inside a
function; define the query once with `queryOptions()` at module scope or in an exported factory,
preload it in the route loader with `ensureQueryData()`, and pass the same options to the hook. For
`useInfiniteQuery` and `useSuspenseInfiniteQuery`, use `infiniteQueryOptions()` and
`ensureInfiniteQueryData()`. Its
`adamantite/no-query-data-in-state` rule reports `useState` initialized from query data; read the
value from the query result and keep only the user's edits in state. Do not wrap options in a
spread object, or move the hook out of the route file, only to silence `query-from-loader`.

The `jest` and `vitest` presets apply their rules only to the files that the test runner runs as
tests by default, which each preset exports as `testFiles`. When the project keeps tests in other
files, replace the preset in `extends` with an override of the project's own:
`{ files: [...], plugins: vitest.plugins, rules: { ...vitest.rules } }`. Change a test rule in such
an override, not in the top-level `rules`, which do not reach test files. Keep `plugins` in the
override, because Oxlint ignores its `vitest/*` rules without it.

The `react-doctor` preset requires the `react` preset and the `oxlint-plugin-react-doctor`
package, which `init` installs at a pinned version and doctor and `update` keep in sync. It
enables curated React Doctor rules for React state and effect misuse, such as
`no-effect-event-handler` and `no-fetch-in-effect`, and adds to `react-strict`. The package has
a modified MIT license: using it as machine learning training data or selling it as a
hosted product needs written permission from the copyright holder. Tell the user before you
select the preset.

The `effect` preset needs the `@effect/tsgo` package, which `init` installs at a pinned
version and doctor and `update` keep in sync. Its rules exist only in the Effect builds of
Oxlint that `@effect/tsgo` ships, and Adamantite loads them when it runs Oxlint. Run Oxlint
through `adamantite check` or `adamantite fix`: a plain `oxlint` call stops with
`Unknown plugin: 'effecttsgo'`. Do not remove the preset to get past that error. A `prepare`
script that runs `adamantite prepare` is left over from earlier versions, so remove that
command from the script. `tsconfig.json` needs
`{ "name": "@effect/language-service", "diagnostics": false }` in `compilerOptions.plugins`,
and `knip.config.ts` needs `ignoreDependencies.effect`. To allow an unstable Effect module
on purpose, add it to `allowedUnstableApis` in that tsconfig entry. Do not turn off
`effecttsgo/unstable-api-usage`. In Effect 4.0.2 and later, the platform modules (such as
`effect/FileSystem` and `effect/Path`), `@effect/platform-node`, and `@effect/vitest` are
unstable. An entry can be a module or a full package.

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
  runs one stage. `check` fails on Oxlint warnings. Fix a warning; do not add `--allow-warnings` to pass it.
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
adamantite check src -- --format github
bun run analyze -- -- --directory packages/app
adamantite analyze --only monorepo -- --ignore-package package-a
```

## Diagnose and repair

Run the read-only assessment:

```shell
adamantite doctor
```

Doctor also reports when the installed packages cannot run Oxlint, such as a declared package
that is not installed, or no `@effect/tsgo` build for the installed Oxlint or tsrs.

Follow each finding. Doctor supplies the current state, the goal criteria, reference
content when needed, and the verification command. In an interactive terminal, Doctor
offers to hand off to an installed coding agent CLI, or to copy the combined Markdown prompt. In a
non-interactive run — the path an agent uses — Doctor prints Markdown directly. Findings
produce a repair prompt and exit 1. Assessment warnings alone produce a warning report
and exit 0. Run `adamantite doctor` again until it exits 0.

## Harden

To turn the coding standards that the project follows into custom rules, run:

```shell
adamantite harden
adamantite harden --path packages/web
adamantite harden --commits 500
```

In a non-interactive run, `harden` prints a Markdown prompt and exits 0. Follow the prompt: list
the candidate standards, show them to the user, and write nothing until the user approves. When
no human can approve, stop after you show the candidates. In an interactive terminal, `harden`
offers a handoff to an installed coding agent CLI, a copy of the prompt, or nothing. In a
monorepo, `--path` limits the session to one workspace package or folder. `--commits` sets how many
recent commits the agent reads for fixed mistakes, and the default is 200. After a
handoff, it runs `check`, then the Doctor assessment, and exits 1 when either of
them fails, or when the session added a link to a Markdown file that does not exist. `harden` never
produces Doctor findings. The prompt lists the disable comments of each rule, and marks each file
of an override that turns a rule off. Use `adamantite rule try` for each trial that the prompt
asks for.

## Update

For an existing installation, run:

```shell
adamantite update
adamantite doctor
```

`update` updates Adamantite-managed dependencies and, with the effect preset, patches Oxlint
and TypeScript again. It copies this skill again when the copy that `init` installed differs
from the skill in the installed package. It then reports any remaining doctor findings. Follow those findings and review the resulting diff.

## Custom rules

Each rule file in the rules folder, `.adamantite/lint/` by default, is an Oxlint rule that this
project owns. `custom()` from `adamantite/rules` loads the folder and enables each
rule as `error` under the `project` plugin: `no-process-env.ts` becomes
`project/no-process-env`. Add a file to add a rule. Delete the file to remove the rule.
`adamantite rule add <name>` writes only a rule stub. Keep the rule and the helpers that it uses
in the project. RuleTester and its cases are internal agent verification: use them while you work,
and remove your temporary cases, fixtures, and verification-only helpers before handback.
Preserve user-owned saved rule tests. Keep new saved tests only when the user asks for them.
During harden, use `adamantite rule add test <name>` to prepare temporary cases beside a new
rule, adapt the cases, run `adamantite rule test --path <test-file>`, and remove the test after
verification. The command fails if a test already exists; preserve that test and use temporary
cases from stdin for additional verification.

When Doctor reports the previous custom-rules API, replace `adamantite/lint/custom` with
the default import from `adamantite/rules`. Move authoring imports from `adamantite/rules`
to `adamantite/rules/plugin`. Move the old default folder to `.adamantite/lint`, or set its
path explicitly with `dir`. Preserve rule behavior, plugin names, severity, and options.

Write a rule only for a pattern that recurs. A rule that guards one file costs more than it
saves.

- A file that starts with `_`, such as `_helpers.ts`, is a helper, not a rule. Declaration files
  and `.test.*` files are not rules. Subfolders are not read.
- Export the rule as default with `defineRule` from `adamantite/rules/plugin`. The same module exports
  the `Context`, `Rule`, `Visitor`, and `ESTree` node types.
- Use `createOnce`. It runs one time for each lint run, not one time for each file. Reset
  per-file state in `before`, and report collected results in `after`. `context.filename`,
  `context.sourceCode`, and `context.settings` are not available in the body of
  `createOnce`. Read them in `before` or in a visitor.
- Write erasable TypeScript only. Oxlint loads rule files with Node.js type stripping, so
  `enum`, a `namespace` with values, parameter properties, and `import x = require()` stop
  the lint run.
- Rules get no type information. Use only the AST and `context.sourceCode`.
- Report with a `messageId`, and put each message in `meta.messages`. Describe the options in
  `meta.schema`, and read them from `context.options`.
- A rule that throws prints an error for each file, and the lint run still exits 0. After you
  change a rule, run the lint and read all of its output.
- To find node names, run `adamantite rule ast <file>` on real code. It prints the same
  ESTree-shaped AST that rules visit.
- To see what a rule reports before you change the config, run
  `adamantite rule try <rule> --report <case> --accept <case>`, with `--options '<json array>'`
  for the options after the severity, or `--current` for the setting of the config. A case is a
  project path, or `<path>=<file>` to lint the content of `<file>` at `<path>`. It lints the
  cases in a copy of the project, and exits 2 when the trial is not evidence, such as for a rule
  that does not exist.
- When a rule has much logic, keep the rule file thin. Put the logic in plain functions in a
  `_<name>.ts` helper, such as a function that gets an import path and returns its layer. The
  rule file only connects the functions to the visitors. Test the rule through `RuleTester` as
  usual, with temporary cases. Verify a helper directly only when its cases are too many for
  `RuleTester`, and discard those verification cases too.
- The message tells the author what to do instead, and links the standard or the doc that
  states it, such as `CODING_STANDARDS.md` or `docs/architecture.md`.
- Before you finish a new rule or a change to a rule, use `RuleTester` from
  `adamantite/rules/testing`. Put code that must report in `invalid`, and similar code that
  must pass in `valid`. Cover the syntax forms and file paths that the standard applies to.
- For a bug fix, run a temporary regression case first and confirm that it fails. Then fix
  the rule and confirm that all valid and invalid cases pass. Change a case only when it is
  wrong, and explain that change.
- Run verification from stdin, as below, or from a temporary test file beside the rule.
  Use Node.js even in a Bun project. Do not add saved tests or a CI step by default.
- Remove your temporary cases and fixtures before handback. Preserve existing user-owned tests
  and CI steps, and keep the rule, its runtime helpers, and the required config. Report the cases and the verification result briefly.
- Oxlint caches the rules for each run. Restart the editor language server after you change a
  rule.
- TypeScript does not check `.adamantite/lint/` by default, because its name starts with a dot. Add
  `".adamantite/lint"` to `include` in `tsconfig.json` to check it. Enable
  `compilerOptions.allowImportingTsExtensions` when checking tests that import `.ts` rule files.
- In a monorepo, give each rules folder its own plugin name, such as `custom({ name: "web" })`:
  Oxlint rejects two plugins with the same name in one run. A relative `dir` resolves from the
  file that calls `custom()`, so a shared tooling package can own the rules with
  `custom({ dir: "rules", name: "acme" })`. A nested Oxlint config replaces the root config, so
  a package that needs the root rules extends the root config.
- `adamantite analyze` treats the rule files and optional `.test.*` files in `.adamantite/lint/` as
  Knip entry files, in the root and in each workspace package. Knip still reports a helper that no
  file imports. For a rules folder at another path, set `oxlint.entry` in `knip.config.ts` to the
  patterns of the preset and of that folder.

For the stub from `adamantite rule add no-debugger`, run this from the project root.
Adapt the cases after you write the rule:

```sh
node --input-type=module <<'JS'
import { RuleTester } from "adamantite/rules/testing"
import rule from "./.adamantite/lint/no-debugger.ts"

new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run("no-debugger", rule, {
  invalid: [{ code: "debugger", errors: [{ messageId: "unexpected" }] }],
  valid: ["const value: number = 1"],
})
JS
```

Verification is complete when every case passes, the command exits 0, and the project has
no temporary verification cases or fixtures left from your work. Then run `adamantite check` and `adamantite doctor`.

Users can opt in to saved tests with `adamantite rule add test`. It lists existing rules for
selection. `adamantite rule add test no-debugger` skips the list and fails if the rule does not
exist. The command writes `no-debugger.test.ts` beside `no-debugger.ts`; `--dir` selects another
rules folder. Adapt the generated valid and invalid cases to the rule. `--path <file>` writes
the test elsewhere, with a relative import of the rule. Existing files stay unchanged.
Run saved tests explicitly with `adamantite rule test`, or `adamantite rule test --path <file>`
for a test saved elsewhere. Use `.test.ts` for tests in the rules folder so the plugin does not
load them as rules. Init, CI generation, and harden do not run saved tests by default.
For another rules folder, keep its rule and test patterns in the Knip `oxlint.entry` setting.
For a test outside the rules folder, add that file to the Knip entry settings if needed.
Saved tests use `node:test`. Exclude them from Vitest `test.exclude` or Jest
`testPathIgnorePatterns`, and keep the runner's default and existing exclusions. The README
Custom rules section has config examples. For a custom `--path`, exclude that path instead.

## Decision guide

- New target project: `init`, then run the configured checks.
- Suspected drift or broken setup: run `doctor` and follow its findings.
- Existing project upgrading Adamantite: `update`, then the doctor sequence.
- Code-quality failure: choose `check` or `analyze` based on the failing subsystem; do not
  reinitialize the project.
- Project-specific lint rule: add a custom rule with `adamantite rule add <name>`; do not
  edit Adamantite presets.
- Coding standards that live only in instructions or in the code: run `harden` and follow its
  prompt.
- Unknown option or behavior: run `adamantite <command> --help` before guessing.
