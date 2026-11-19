# How to set up Adamantite

## Select the setup

Read `adamantite init --help` for the available scripts, presets, and editors.
As an agent, set up from flags with `--json`, which never prompts and prints one JSON document.
Include at least one `--script` or `--typescript`.
For example, to configure checks, fixes, TypeScript, and agent instructions, run:

```sh
npx adamantite init --json --script check --script fix --typescript typescript --agents
```

`--typescript typescript` writes `adamantite/typescript`, which adds type resets, so
`JSON.parse()` returns `unknown`. Use `--typescript tsconfig` for a library that publishes
declaration files, because those files can name reset helper types that consumers do not have.
A project that already has ts-reset can delete its `reset.d.ts` files and the
`@total-typescript/ts-reset` dependency after it extends `adamantite/typescript`.

Adapt the selected options to the request. Omitted boolean flags are disabled.
`--agents` writes `AGENTS.md` with the Adamantite instructions when the project has none, and
writes the Adamantite skills to `.agents/skills`, and to `.claude/skills` or `.grok/skills` when the project
has `.claude/` or `.grok/`. An existing `AGENTS.md` stays as it is, and Doctor reports the
`missing-agents-section` finding when it has no Adamantite section.

Before selecting `react-strict`, tell the user about its modified MIT license.
The installed `oxlint-plugin-react-doctor` license requires written permission for use as
machine learning training or evaluation data, and for certain paid or hosted services.
Read that license for the exact restrictions.

Continue when each selected option serves the requested setup.

## Create the selected setup

Run `init` with those options. It records the selection in `.adamantite/adamantite-lock.json`,
and a later `init` adds its options to that selection. Commit the lockfile with the setup.
It sets each selected script in `package.json` to its Adamantite command and replaces what the
script ran. Before you select a script that already runs another command, check that the task
includes replacing it. Otherwise, leave that script out, or move its command to a script of
another name first. After a move, find each place that ran the script, such as a CI workflow or a
Git hook, and make it run the new script too. The workflow that Adamantite writes runs only the
managed scripts, so a test that the replaced script ran no longer runs in it.
It writes each managed config, such as `oxlint.config.ts`, whole, and keeps a config that the
project changed. Do not merge the reference config into a kept file. Read `setup.files` in the
JSON for a `Kept` file. `init` exits 1 when findings remain after the setup, and
`assessment.findings` lists them. Repair them as the Doctor step of the `adamantite` skill says.

Adamantite requires TypeScript 7 or later in the target project's own `package.json`.
Check that declaration if npm cannot install or update a managed plugin.

Continue when the selected dependencies are installed and the generated files match the request.

## Complete managed plugin setup

If the selected presets include a managed plugin, check its setup:

- For `react-strict`, include the `react` preset and keep `oxlint-plugin-react-doctor`
  installed. Init installs the pinned package, and Doctor and update maintain it.
  Its React Doctor checks also apply in hook modules.
- For `effect`, run Oxlint through Adamantite. A plain `oxlint` call cannot load the
  `effecttsgo` rules and stops with `Unknown plugin: 'effecttsgo'`. Replace that call with
  `adamantite check --only lint` instead of removing the preset.
  Keep `{ "name": "@effect/language-service", "diagnostics": true }` in
  `compilerOptions.plugins`. In a monorepo, add it to each package's tsconfig or a shared base.
  Use `ignoreDependencies.effect` from `adamantite/analyze` in `knip.config.ts`.
- For Effect editor support, follow Doctor's editor findings. After a dependency install, run
  `adamantite update` to prepare or refresh the VS Code SDK cache. Select the workspace
  TypeScript version in VS Code. Zed uses the installed Effect CLI.
- For `tailwind`, check that the project uses Tailwind v4. Init installs `@shadcn/lint`.
  If components are outside the directories that `components.json` identifies, set
  `settings.shadcn.ui` in `oxlint.config.ts`.
  Without `components.json`, the plugin looks in `components/ui` or `src/components/ui`.
  For another component directory, copy the preset's component-owned rule override to that directory.

Continue when Doctor reports no findings for the selected plugins and editors.

## Adopt Adamantite in existing code

Code written before the setup can get many reports from `adamantite check`. Do not turn a preset
rule off for the whole project, set it to `warn`, or add disable comments to make the check pass.
Keep each rule at `error`, and turn it off only for the files that break it now.

1. Run `adamantite fix` to apply the safe fixes and format the files. Review the diff, and commit
   it apart from the setup.
2. Count the remaining reports for each rule. Oxlint prints its JSON report when you pass
   `--format json` after `--`, and `check --only lint` prints no heading above it. `check` exits 1
   while reports remain, and the JSON is still complete.

   ```sh
   adamantite check --only lint -- --format json > lint.json
   node -e '
     const { diagnostics } = JSON.parse(require("node:fs").readFileSync("lint.json", "utf8"))
     const files = new Map()
     for (const { code, filename } of diagnostics) {
       files.set(code, new Set([...(files.get(code) ?? []), filename]))
     }
     for (const [code, names] of [...files].sort((a, b) => b[1].size - a[1].size)) {
       console.log(code, names.size, [...names].join(" "))
     }
   '
   ```

   Each line names a rule, the number of files that break it, and those files. A report's
   `code` names the rule as `<plugin>(<rule>)`. In the config, the rule is `<plugin>/<rule>`, such
   as `typescript/no-explicit-any` for `typescript(no-explicit-any)`. The core ESLint rules have
   no prefix, so `eslint(no-debugger)` is `no-debugger`.

3. Fix the code for the rules with few reports, when each fix keeps the behavior of the code.
4. For each remaining rule, add an `overrides` entry to `oxlint.config.ts` that turns the rule off
   only in the files that break it now, such as
   `{ files: ["src/legacy/cart.ts"], rules: { "typescript/no-explicit-any": "off" } }`. In a
   comment above the entry, state the change that removes each file from it. New files follow the
   rule.
5. Run `adamantite check` until it passes, and delete `lint.json`.

Report the number of files in each override to the user. A later `adamantite harden` run finds the
files that no longer break a rule, so the overrides can shrink.

Continue when `adamantite check` passes without a disable comment or a rule that the project
turned off for every file.

## Check the setup

- Each selected managed script runs successfully.
- `.adamantite/adamantite-lock.json` exists and is committed with the setup.
- Doctor reports no findings, and its assessment warnings are recorded.
- Existing scripts and configuration are preserved unless the task includes replacing them.
- In existing code, each preset rule stays at `error`, and an override turns it off only for the
  files that break it now.
- Each command that a replaced script ran still runs where it ran before, such as in CI.
