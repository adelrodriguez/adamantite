# How to set up Adamantite

## Select the setup

Read `adamantite init --help` for the available scripts, presets, editors, and skill agents.
Use explicit `--non-interactive` setup as an agent. Include at least one `--script`.
For example, to configure checks, fixes, TypeScript, and agent instructions, run:

```sh
npx adamantite init --non-interactive --script check --script fix --typescript --agents
```

Adapt the selected options to the request. Omitted boolean flags are disabled.
Use `--skill-agent` to install this skill for a coding agent. `--agents` adds instructions
to `AGENTS.md` and does not install the skill.

Before selecting `react-doctor`, tell the user about its modified MIT license.
The installed `oxlint-plugin-react-doctor` license requires written permission for use as
machine learning training or evaluation data, and for certain paid or hosted services.
Read that license for the exact restrictions.

Continue when each selected option serves the requested setup.

## Create the selected setup

Run `init` with those options. It preserves existing package scripts whose commands differ
from its managed commands. Use `--overwrite-scripts` only when the task includes replacing them.
Read the output for preserved configuration that needs a Doctor repair.

Adamantite requires TypeScript 7 or later in the target project's own `package.json`.
Check that declaration if npm cannot install or update a managed plugin.

Continue when the selected dependencies are installed and the generated files match the request.

## Complete managed plugin setup

If the selected presets include a managed plugin, check its setup:

- For `effect`, run Oxlint through Adamantite. A plain `oxlint` call cannot load the
  `effecttsgo` rules and stops with `Unknown plugin: 'effecttsgo'`. Replace that call with
  `adamantite check --only lint` instead of removing the preset.
  Keep `{ "name": "@effect/language-service", "diagnostics": true }` in
  `compilerOptions.plugins`. In a monorepo, add it to each package's tsconfig or a shared base.
  Use `ignoreDependencies.effect` from `adamantite/analyze` in `knip.config.ts`.
  Remove the obsolete `adamantite prepare` command from an existing `prepare` script.
- For Effect editor support, follow Doctor's editor findings. After a dependency install or
  update, run `adamantite init --non-interactive --script check --editor vscode` to prepare
  or refresh the VS Code SDK cache. Keep the project's other setup options when needed.
  Select the workspace TypeScript version in VS Code. Zed uses the installed Effect CLI.
- For `tailwind`, check that the project uses Tailwind v4. Init installs `@shadcn/lint`.
  If components are outside the
  directories that `components.json` identifies, set `settings.shadcn.ui` in `oxlint.config.ts`.
  Without `components.json`, the plugin looks in `components/ui` or `src/components/ui`.
  For another component directory, copy the preset's component-owned rule override to that directory.

Continue when Doctor reports no findings for the selected plugins and editors.

## Check the setup

- Each selected managed script runs successfully.
- Doctor reports no findings, and its assessment warnings are recorded.
- Existing scripts and configuration are preserved unless the task includes replacing them.
