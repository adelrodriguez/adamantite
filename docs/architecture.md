# Architecture

Adamantite is an agent-first preset package and CLI that applies and maintains code-quality
tooling in a target project. Product behavior is documented in the [README](../README.md), and
domain terms live in [GLOSSARY.md](../GLOSSARY.md).

Each section says what an area is for, names the module that owns it, describes how the area
works, and lists its invariants with the rule or the test that holds each one, or `Nothing` when
none does.

## Runtime

`bin/adamantite` loads `dist/index.js`, which Tsdown bundles from `src/index.ts`, beside the
presets. The CLI bundle and the Oxlint entry include Effect and `@effect/platform-node`, so Node.js
loads three files at startup in place of more than two hundred Effect modules, and the package
installs neither. Each runtime dependency of `package.json`, such as `oxc-resolver`, stays outside
the bundles, and `tsdown.config.ts` fails the build when a bundle imports another package.
`src/index.ts` starts the Effect runtime, `src/cli.ts` defines the command tree and the services,
and each module of `src/commands` defines one command. The Oxlint entry, `src/oxlint/index.ts`, and
the probe plugin, `src/oxlint/probe.ts`, run in Oxlint's process, and build as `dist/oxlint.js` and
`dist/probe.js`.

`bin/adamantite` turns on the compile cache of Node.js when the runtime has one, so a later start
skips compiling the bundle. When the cache has a folder, `bin/adamantite` hands it to the tools that
the CLI starts, such as Oxlint and Oxfmt, through `NODE_COMPILE_CACHE`, unless the user set that
variable. The second build of `tsdown.config.ts` writes the presets to `dist/presets` with their
declarations, and copies the TypeScript presets, the type resets, and the license notices of the
plugins. The tests below `presets` stay out of the package.

`makeAppLayer` takes the `CommandRunner` layer as a parameter, so `src/__tests__/cli.test.ts` runs
the same wiring with a runner that starts no process. It provides the local time zone, so the date
that harden gives the agent is the date of the user.

Code that always acts on the target project reads its folder with `yield* Project.Directory`, from
`src/lib/project/index.ts`. Code that callers also run on another folder, such as a trial copy or a
workspace package, takes the folder as a parameter.

A module whose name ends in `.macro.ts` is a build-time macro. Unplugin macros expands each call in
the Tsdown build and in the source transform of Vitest, so the bundle inlines the templates and the
versions and reads neither from disk at run time. `src/lib/shared/version.macro.ts` imports
`package.json` statically, so the macros stay synchronous, and the modules that import them need no
top-level `await`.

| Invariant                                                                                                                                                        | Held by                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A command runs in the target project, the folder that `yield* Project.Directory` gives, and no other code reads or changes the working directory of the process. | `eslint/no-restricted-properties` in `oxlint.config.ts`                                                                                             |
| External behavior is behind the Effect services that `makeAppLayer` in `src/cli.ts` provides, so a test runs a command without changing a real project.          | `project/file-writers` and `adamantite/import-owners`, for the writes and the prompts, and `inMemoryTests` in `config/tests.ts`, for the unit tests |
| The build writes the Oxlint entry and the probe plugin beside the CLI bundle.                                                                                    | `scripts/test-build.ts`                                                                                                                             |
| When the CLI has a compile cache folder, the tools that the CLI starts get it, unless the user set one.                                                          | `scripts/test-smoke.ts`                                                                                                                             |
| The package runs under Node.js and Bun.                                                                                                                          | The tests, under Node.js, and the `test` workflow, with the minimum Bun                                                                             |

## Layers

The layer maps in `adamantite/layers` in `oxlint.config.ts` are the only statement of the
layers. Each layer has an explicit `imports` list and can contain another map in `layers`.
Imports are transitive within each map. Declaration order does not change permissions. An import
that breaks a map, or a folder that is not in its map, fails `pnpm run check`.

This table lists each layer of the `src` map and of its nested `lib` map, with the layers that it
imports directly. `src/__tests__/architecture-doc.test.ts` fails when the table and the map
disagree.

| Folder                 | Job                                                                                                                                                                                          | Imports              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `src/commands`         | Define the Effect CLI input of each command, decide its output mode, and compose the lib operations.                                                                                         | `terminal`           |
| `src/terminal`         | Print status lines, findings, setup lines, and JSON documents, prompt the user, hand prompts off through `Resolution.offer`, and print the title.                                            | `lib`                |
| `src/lib`              | Hold the library. Lib code returns data, and never prints a line or asks a question.                                                                                                         | None                 |
| `src/lib/setup`        | Apply a selection with `Setup.apply`: install the packages, set the managed scripts, write the managed files under the write rule, and write the lockfile last.                              | `integrations`       |
| `src/lib/assessment`   | Assess the project with each integration that the selection includes, and render the repair prompt and the warning report.                                                                   | `integrations`       |
| `src/lib/bridge`       | Run the check, fix, and analyze stages, route forwarded arguments, and decide the failure policy.                                                                                            | `integrations`       |
| `src/lib/hardening`    | Find the configs, rules folders, instructions, and Markdown files of the project, count the suppressions, find the discovery gaps, run rule trials, and render the harden prompt.            | `integrations`       |
| `src/lib/integrations` | Hold the `Integration` list and one folder for each integration: its packages, its managed files, its `assess`, and its command builder.                                                     | `handoff`, `project` |
| `src/lib/handoff`      | Detect the installed coding agent CLIs, and hand the terminal to one of them.                                                                                                                | `shared`             |
| `src/lib/project`      | Read the target project: `package.json`, the workspace, the lockfile and its selection, the configs through the config loader, and the custom rules. Detect the package manager and install. | `shared`             |
| `src/lib/shared`       | Define errors, filesystem and JSON helpers, the command runner, the working directory, the forwarded arguments, the public imports, and templates.                                           | None                 |

`setup`, `assessment`, `bridge`, and `hardening` are siblings above `integrations`, so none of
them imports another. `assessment` does not import `hardening`, because harden is not an
assessment. `project` and `handoff` are siblings too. `project` knows target-project files and
package state, but not integration types such as `Finding`. Lib code returns data, and commands
render it, so no lib module imports `terminal`.

`cli.ts`, `index.ts`, and the files in `oxlint/` are entries of the `src` map. An entry imports any
layer, and no layer imports an entry. Tests share the helpers in `src/__tests__`, so the `src` map
does not check them. That ignore does not exempt tests from the `lib` map.

The folders inside the layers belong to the layer that holds them:

| Folder                                            | Job                                                                                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/integrations/agents`                     | The `agents` integration: `AGENTS.md` with the Adamantite section, and each Adamantite skill in each skill folder.                                                                                   |
| `src/lib/integrations/github`                     | The `github` integration: `.github/workflows/adamantite.yml`.                                                                                                                                        |
| `src/lib/integrations/knip`                       | The `knip` integration: `knip.config.ts`, its Knip config schema, and the Knip command builder.                                                                                                      |
| `src/lib/integrations/oxfmt`                      | The `oxfmt` integration: `oxfmt.config.ts`, the plugin languages, and the Oxfmt command builder.                                                                                                     |
| `src/lib/integrations/oxlint`                     | The `oxlint` integration: `oxlint.config.ts`, the preset catalog, the Oxlint runtime, the Oxlint entry, the probe runner, and the command builder. Also the `oxlint-custom` and `tsrs` integrations. |
| `src/lib/integrations/oxlint/plugins`             | The managed plugins: one definition for each, and the registry that the preset catalog derives.                                                                                                      |
| `src/lib/integrations/oxlint/plugins/effect-tsgo` | The `@effect/tsgo` managed plugin and its runtime resolver.                                                                                                                                          |
| `src/lib/integrations/sherif`                     | The `sherif` integration and the Sherif command builder.                                                                                                                                             |
| `src/lib/integrations/tooling`                    | The package checks that several tools share.                                                                                                                                                         |
| `src/lib/integrations/typescript`                 | The `tsconfig` integration: `tsconfig.json`, and the checks that ask TypeScript which files a config loads.                                                                                          |
| `src/lib/integrations/vscode`                     | The `vscode` integration: `.vscode/settings.json` and `.vscode/extensions.json`.                                                                                                                     |
| `src/lib/integrations/zed`                        | The `zed` integration: `.zed/settings.json`.                                                                                                                                                         |
| `src/lib/project/custom-rules`                    | The rules folders, the `custom()` calls that the loaded configs reach, and the rule stubs of `rule add`.                                                                                             |

`adamantite/import-owners` in `oxlint.config.ts` adds two boundaries that the layers cannot state:

- Only `src` and `scripts` import a module of `src`, so no preset and no preset test imports the
  CLI code.
- Only `src/commands`, `src/terminal`, and the tests import `effect/cli/Prompt`, so lib code never
  asks.

`project/file-writers`, the custom rule in `.adamantite/lint/file-writers.ts`, lets only the file
writers that it lists change the disk. In the non-test files of `src`, it rejects a call to a
`FileSystem` method that writes, such as `writeFileString` or `remove`, and an import of
`ensureDirectory` or `writeFile` from `src/lib/shared/filesystem.ts`. It also rejects `node:fs`
outside the build-time macros, so no write bypasses `FileSystem`.

## Integrations

An integration is one folder in `src/lib/integrations` and one line in the list of
`src/lib/integrations/index.ts`. Each one implements `Integration` from
`src/lib/integrations/base.ts`: `selected`, `packages`, `files`, `assess`, and the optional
`prepare`, which only `vscode` has.

The list holds `oxlint`, `oxfmt`, `knip`, `sherif`, `tsconfig`, `vscode`, `zed`, `github`, and
`agents`. Three more integrations only assess, and `src/lib/assessment/index.ts` runs them first:
`oxlint-custom` in `src/lib/integrations/oxlint/custom.ts`, the managed plugins in
`src/lib/integrations/oxlint/plugins/managed.ts`, and `tsrs` in
`src/lib/integrations/oxlint/tsrs.ts`.

`assess` reads the project and never writes. `packages` can depend on the project, as `sherif`
installs Sherif only in a monorepo. `prepare` runs after the install and builds what an integration
needs outside the files that the project commits, such as the Effect editor SDK of `vscode`. A
failure that `assess` reports as a finding does not fail the setup. `doctor --json` prints each
`Finding` and `PackageAction` as its schema encodes it, and `update` installs the package actions.

`assessPackage` in `src/lib/integrations/tooling/base.ts` compares the version that the project
declares for a managed package with the managed version. A pnpm catalog entry at another version
gets a finding that asks for a change to the catalog, because `pnpm add` replaces the `catalog:`
specifier, so `update` does not install it. A catalog entry that is missing or unreadable gets a
warning.

The modules that end in `.macro.ts` run at build time and inline a file into the bundle, so a
command reads no template from disk: the workflow template of `github`, the `AGENTS.md` section and
the shipped skills of `agents`, and the config template of `oxfmt`.

### Managed configs

Oxlint, Oxfmt, and Knip each have one TypeScript config that the integration renders whole:
`oxlint.config.ts`, `oxfmt.config.ts`, and `knip.config.ts`. The JSON configs of the tool conflict
with it. When the project has one, `renderConfigFile` in `src/lib/integrations/config-file.ts`
renders no config, because the tool would not load the managed config beside it, and
`assessConfigFile` reports the conflict. It also reports a missing config, a config that does not
load, and a loaded config that the inspection of the integration rejects. The Oxfmt and Knip
inspections check that the config applies the Adamantite preset, by the identity key of
`presets/identity.ts`, and the Oxlint inspection checks the options that Adamantite requires.

The Knip config also spreads the `ignoreDependencies` lists of `adamantite/analyze` that the
selection needs. `monorepo` ignores Sherif, which `adamantite analyze` runs and no Knip plugin sees,
and `effect` ignores the `@effect/language-service` plugin name in `tsconfig.json`. The selection
decides the lists, so the config of the `effect` preset is right in the first `init`, before the
Oxlint config imports the preset.

Oxfmt formats Astro and Svelte only through a bundled Prettier plugin, which imports a package from
the project. `assessPluginLanguages` in `src/lib/integrations/oxfmt/languages.ts` reports a language
whose framework `package.json` declares, but whose package Oxfmt cannot load in the version that
its optional peer range names. The format preset turns on each plugin language, and the editor
settings format each one with Oxfmt.

### The Oxlint config

`toOxlintTsConfigContent` in `src/lib/integrations/oxlint/config.ts` writes the imports sorted by
module, as Oxfmt sorts them, and always extends `custom()`, which is an empty config until the
project adds a rule to `.adamantite/lint`. `extends` lists core first, then the presets in the
order of `LINT_PRESETS`, because a later entry replaces the rules of an earlier one. Doctor reports
a preset before core with the `core-preset-order` finding.

A selected preset counts as applied when any config that Oxlint loads applies it, in an override
or in the config of a workspace package too. A config that does not load can apply any preset, so
then Doctor reports no missing preset. The `oxlint-config-load-failure` finding reports an Oxlint
that stops before it lints a file, with Oxlint's error, when no runtime finding explains it.

`src/lib/integrations/oxlint/replacements.ts` imports the first-party plugin modules to read the
`meta.docs.replaces` of each rule, because the presets load each plugin by file URL. A config with
enough overrides of the kind that a rule replaces gets a warning, not a finding, because the config
is valid.

`src/lib/integrations/oxlint/custom.ts`, the `oxlint-custom` integration, reports a rules folder
that no `custom()` call loads, a `dir` that names a missing folder, and rules folders that share a
plugin name. A call without `dir` loads the default folder, which the project creates with its
first rule, so only a call that names a folder expects the folder to exist. A config that does not
load can load any folder, so then Doctor reports no unloaded folder, and warns. A rule file that
does not load stops Oxlint, so `oxlint-config-load-failure` reports it. A saved rule test is the
choice of the user, and gets no finding.

### TypeScript config

`src/lib/integrations/typescript/index.ts` writes a root `tsconfig.json` that extends the selected
preset, with the Effect language service entry for the `effect` preset. The write rule keeps a
config that the project changed, so Adamantite never adds the entry to it. The `@effect/tsgo`
managed plugin reports a missing entry with `assessTsconfigPlugin` from
`src/lib/integrations/effect-language-service.ts`, and warns in a monorepo, where each package can
name the plugin in its own config.

In a monorepo, a root config that extends a preset makes TypeScript treat all packages as one
project, so Adamantite writes no root config there, and Doctor asks for the preset in each package.
A root config that Adamantite wrote before the project became a monorepo stays managed, because
other configs can extend it.

Doctor follows the `extends` chain of the root config and of each workspace package config through
its relative and absolute entries. A package entry that is not an Adamantite preset makes the base
unknown, and Doctor reports neither a missing nor a mismatched preset for that config. Doctor
classifies a chain that names both presets, and no unknown package entry, as
`adamantite/typescript`. The project's own TypeScript tells whether a config loads the type resets,
through `tsc --showConfig`, and Doctor runs it only for a config with `extends`. When TypeScript is
not installed or the command fails, Doctor treats the config as one without the resets and goes by
its classification of the chain, which does not show the files that TypeScript loads. A package that
is not private and declares `exports` or `types` is a library. A library uses `adamantite/tsconfig`
whatever the selection, and gets a finding only when it loads the resets.

### Editors

`vscode` and `zed` write settings that start Oxlint through the Oxlint entry and format with
Oxfmt. `EDITOR_OXLINT_ENTRY` in `src/lib/integrations/oxlint/entry.ts` is the path of the entry
from the project root. `getProjectDirectory` finds the project from that path: the folder above the
first `node_modules`, which also covers a package manager store inside the project, such as
`node_modules/.pnpm/`. The Adamantite repository starts the entry as `src/oxlint/index.ts`, outside
`node_modules`, so there the project is the working directory.

When the project installs `@effect/tsgo`, `readEffectEditor` in `src/lib/integrations/effect-sdk.ts`
gives the editors the Effect language server. Each editor turns off every `effecttsgo/` rule in the
Oxlint server, so the Effect server alone gives their diagnostics and the semantic quick fixes, and
CLI Oxlint keeps the rules.

VS Code starts a copy of the Effect editor SDK in `node_modules/.cache/adamantite/effect`. The
`prepare` of `vscode` copies the build of `@effect/tsgo` that matches the installed native
TypeScript by its gitHead, and Doctor reports a copy that is stale or incomplete. A project without
a matching build gets the `vscode-effect-sdk` finding, and its setup does not fail. Zed starts the
installed `@effect/tsgo` CLI by its path in `node_modules`. A project whose CLI Zed cannot find gets
the settings without the Effect server, and the `zed-effect-server` finding.

### GitHub workflow

`github` writes `.github/workflows/adamantite.yml`, with the install steps of the detected package
manager and a job for each check and analyze script of the selection. It writes no workflow, and
warns, when the selection runs no CI script or when Adamantite cannot detect the package manager.
The workflow has no step that runs the saved rule tests, and Doctor requires none. A project can add
one, and the write rule keeps the changed workflow. Doctor reports a workflow whose jobs no longer
run a script of the selection, or that hard-codes a Node.js version.

### Agents

`agents` writes `AGENTS.md` with the Adamantite section, between its marker comments, only when the
file does not exist, and never adds the section to a file that the project wrote. Doctor reports a
missing root `AGENTS.md` and one without the section, and checks only the root in a monorepo.

`getShippedSkillFiles` in `src/lib/integrations/agents/skill.macro.ts` inlines each file inside a
skill folder of `skills/` at build time, so the skills that `init` and `update` write match the
running build. The first folder of a path is the name of its skill, so a new skill is a new folder
of `skills/`, and a folder that starts with `_` is not a skill. `detectSkillFolders` in
`src/lib/integrations/agents/skill.ts` gives the shared `.agents/skills` and each other skill folder
whose agent folder exists, such as `.claude/skills`, and each skill goes to each of them.

Doctor reports a copy that misses a shipped file, and a copy with a changed file or with a file that
the skill does not ship. A file whose hash equals the hash in the lockfile is what Adamantite wrote,
because the lockfile records the hash of the content that Setup wrote, after it formats the content
with the project's Oxfmt when the project installs Oxfmt. `update` deletes a file of an earlier
version that is unchanged since Adamantite wrote it, and keeps a file that the project added or
changed, so Doctor reports that file. A `skills-lock.json` that records a shipped skill gets a
finding, because `npx skills update` would then write the folders that Adamantite owns. The lock
belongs to the `skills` CLI, so Adamantite does not edit it, and a lock that does not decode gets no
finding.

| Invariant                                                                                                                                                                                                                                                          | Held by                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| The logic of one tool stays in its folder, such as `src/lib/integrations/knip/config.ts`. Only what several integrations share leaves it: `src/lib/integrations/config-file.ts`, `src/lib/integrations/tooling/base.ts`, and `src/lib/integrations/effect-sdk.ts`. | Nothing. `CODING_STANDARDS.md` states it.                 |
| A command builder is not a member of `Integration`. The `command.ts` of a tool returns `CommandRunOptions` and starts no process, and the bridge and Setup import it.                                                                                              | Nothing                                                   |
| Each plugin language is an optional peer of the installed Oxfmt, and the format preset turns on each one.                                                                                                                                                          | `src/lib/integrations/oxfmt/__tests__/languages.test.ts`  |
| The Oxlint config that `init` writes passes the inspection of Doctor.                                                                                                                                                                                              | `src/lib/integrations/oxlint/__tests__/config.test.ts`    |
| Doctor classifies a chain that names both TypeScript presets, and no unknown package entry, as `adamantite/typescript`.                                                                                                                                            | `src/lib/integrations/typescript/__tests__/index.test.ts` |

## Setup and the write rule

`init` and `update` share one backend. `applySetup` in `src/commands/setup.ts` runs `Setup.apply`
from `src/lib/setup/index.ts` with the selection, which `init` takes from its prompts or flags and
`update` from the lockfile. `init` adds its selection to the recorded one with `addSelection` in
`src/lib/project/selection.ts`. It removes no setup, and the TypeScript preset and the CI provider
that it names replace the recorded ones.

`Setup.apply` runs these steps in order:

1. It installs, in one install, `adamantite` at the running version when the project does not
   declare it, and each package of a selected integration that the project does not declare at the
   managed version. A version from a pnpm catalog stays, because `pnpm add` would replace the
   `catalog:` specifier, and the integration's `assess` reports an outdated catalog entry.
2. It runs the `prepare` of each selected integration.
3. It formats each managed file with the project's Oxfmt, which `adamantite fix` runs too, so `fix`
   leaves the file unchanged and its hash still matches. The formatter starts after the install, so
   a project that this setup gives Oxfmt formats with it. A project without an Oxfmt config formats
   with a copy of the format preset in a temporary folder, and a project without Oxfmt gets each
   file as rendered.
4. It sets the managed scripts, after every managed file formats, so a config that Oxfmt cannot load
   fails before it writes a managed script, a managed file, or the lockfile. It writes
   `package.json` in the layout that the formatter gives it, and only when a script or the install
   changed it.
5. It writes each managed file under the write rule. It deletes each recorded file that the
   selection no longer renders, when the file still has its recorded hash.
6. It writes the lockfile, formatted the same way, and only when its content changes.

The install uses the package manager that `detectPackageManager` in
`src/lib/project/package-manager.ts` finds: the one that the `packageManager` field of
`package.json` names, or else the one of a lockfile, in the project folder or the nearest folder
above it that has either. A field that names an unsupported package manager does not count. When
neither the field nor the lockfile shows the Yarn version, Adamantite treats the project as Yarn 1,
so it adds root packages with `-W`. In a
monorepo, `addRootDevDependencies` adds the packages at the workspace root. It clears the cache of
`ModuleResolver` after the install, also when the install fails part way, because the install
changes `node_modules`.

The write rule: `Setup.apply` writes a managed file only whole, and only when the file does not
exist or its hash equals the hash in the lockfile's `written` map. It never merges or edits a file.
Each file gets a `FileWrite`:

| `FileWrite` | When                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------- |
| `Created`   | The file did not exist.                                                                      |
| `Replaced`  | Its hash equaled the recorded hash, so `apply` wrote the current version over it.            |
| `Unchanged` | It already held the current version.                                                         |
| `Kept`      | The user changed it. Its integration's `assess` reports only a change that breaks the setup. |
| `Deleted`   | The selection no longer renders it, and its hash still matched.                              |

Each managed script gets a `ScriptWrite`: `Added`, `Replaced` with the command that it ran, or
`Unchanged`.

| Invariant                                                                                                                                                                  | Held by                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Setup.apply` is the only code that writes the managed files and the lockfile.                                                                                             | `project/file-writers`, which rejects a file write outside the modules that it lists. Nothing checks which file a listed module writes. |
| `Setup.apply` writes the lockfile last, so the lockfile records what the run wrote.                                                                                        | Nothing                                                                                                                                 |
| The write rule holds, and a second run changes no file, because `apply` formats each file with the project's Oxfmt.                                                        | `src/lib/setup/__tests__/index.test.ts`                                                                                                 |
| A config that Oxfmt cannot load fails `apply` before it sets a managed script or writes a managed file or the lockfile. The install and the `prepare` steps run before it. | `src/lib/setup/__tests__/index.test.ts`                                                                                                 |
| A managed script is the one exception to whole files: `apply` sets each selected script of the root `package.json` to its command.                                         | `src/lib/setup/__tests__/index.test.ts`                                                                                                 |
| Each list of a `Selection` that `addSelection` returns holds each item once, in the order of its source list, so two selections of the same setup are equal.               | `src/lib/project/__tests__/selection.test.ts`, for `addSelection`                                                                       |

## Lockfile

`src/lib/project/lockfile.ts` owns `.adamantite/adamantite-lock.json`: its schema, its read, and
the hash of a managed file.

`written` maps each file that Adamantite wrote whole, by its path from the project root, to the
hash of the bytes on disk. Each setup computes `written` again from the files that it created,
replaced, or found unchanged, so a file that the user changed leaves it. Without a recorded hash,
such as in a project without a lockfile, a file that exists gets a hash only when it already holds
the current version.

`readLockfile` decodes the schema version first, because it decides which schema reads the rest. It
decodes the Adamantite version leniently, because a newer schema can change its type. A schema
version that this Adamantite does not know fails with `UnsupportedLockfile`, and a lockfile that
does not decode fails with `InvalidLockfile`. `readSelection` gives none for both, and Doctor
reports them.

`verifyLockfileVersion` compares the recorded version with the version that the project installs,
not the running one, so a CLI from another install, such as `npx`, judges the project as the
project's own CLI does. `readInstalledVersion` in `src/lib/project/adamantite-version.ts` resolves
`adamantite/lint` as Oxlint loads the preset, so an install in a parent `node_modules`, such as at
the root of a monorepo, counts. A project that installs no Adamantite passes, because Oxlint cannot
load the presets either and reports it. A newer release than the installed one fails with
`SetupAhead`, whose repair is an install, because `update` would bring the setup back to the
installed version. Any other difference fails with `SetupOutdated`, whose repair is `update`. A
version that does not start with release numbers, such as a git source, compares as older, and so
do two prereleases of one release, because `update` with the installed version then ends the drift.

| Invariant                                                                                                                                                                                                      | Held by                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A lockfile that does not decode, or that has a schema version that this Adamantite does not know, fails `init` and `update` before they change a file.                                                         | `src/commands/__tests__/init.test.ts` and `src/commands/__tests__/update.test.ts`  |
| A lockfile that another Adamantite version than the installed one wrote fails `check` after its stages, and Doctor reports it as a finding. `verifyLockfileVersion` is the one comparison of the two versions. | `src/commands/__tests__/check.test.ts` and `src/commands/__tests__/doctor.test.ts` |
| `Project.read` decodes the lockfile one time, and the rest of the code trusts `project.lockfile`.                                                                                                              | Nothing                                                                            |

## Assessment

`Project.read` in `src/lib/project/index.ts` reads the target project one time into a snapshot.
`assessProject` in `src/lib/assessment/index.ts` gives the snapshot to the `assess` of each
integration that the lockfile's selection includes.

`Project.read` reads `package.json`, the workspace, and the lockfile, and discovers the custom
rules. It takes the root `oxlint.config.ts` from the reads of the discovery, which tries
`oxlint.config.ts` first, because each load starts a Node.js process. The workspace patterns are
the `packages` of `pnpm-workspace.yaml`, or the `workspaces` of `package.json` when
`pnpm-workspace.yaml` declares none, because that file can hold only settings, such as
`allowBuilds`. A `pnpm-workspace.yaml` that does not parse declares no pattern and no catalog. A
project that declares patterns is a monorepo, also before any package exists. A workspace package
is a folder with a `package.json` that matches an include pattern and no `!` pattern. Below the
fixed part of a pattern, the search skips `node_modules` and the folders whose names start with a
dot. A command that reads the workspace outside a snapshot, such as `harden` or `rule try`, reads it
one time for each phase and passes the `Workspace` down.

`readAssessment` reads the root `package.json` first, so a project that does not declare
`adamantite` gets its one finding, also when its workspace packages do not read. A lockfile that is
missing, does not decode, or has an unsupported schema version also gives one finding, because the
other assessments need the selection. Any other read failure fails Doctor. `assessProject` runs the
assess-only integrations, which decide from the project whether they apply, then the integrations
that the selection includes, in the order of their lists, which numbers the findings. The findings
start with the version finding of `verifyLockfileVersion`, the error that `check` fails with, so
Doctor reports each version drift that fails `check`. The findings of the managed scripts follow,
under the integration name `scripts`, because no integration owns the scripts.
`renderAssessmentMarkdown` renders findings into the repair prompt with the warnings folded in, and
renders a warning-only assessment into the warning report.

```mermaid
flowchart TD
  A[Read the project] --> B[Assess without mutation]
  B --> C{Findings exist}
  C -->|No| D[Report healthy]
  C -->|Yes| E[Offer one Markdown repair prompt through Resolution.offer]
  E --> F[A coding agent repairs the target project]
  F --> A
```

| Invariant                                                                                                                          | Held by                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `assess` and `doctor` never change the project. A coding agent or the user repairs it, and a later assessment confirms the repair. | `project/file-writers`                  |
| Each reassessment reads a new snapshot, because a handoff or an install changes the project.                                       | Nothing                                 |
| A project without a lockfile, with a lockfile that does not read, or without `adamantite` gets one finding alone.                  | `src/commands/__tests__/doctor.test.ts` |
| Package drift stays structured as package actions, so `update` installs the managed versions.                                      | `src/commands/__tests__/update.test.ts` |

## Resolution and output modes

`Resolution.offer` in `src/terminal/resolution.ts` is the one way that a command hands a prompt to
a coding agent, and `CodingAgents` in `src/lib/handoff/coding-agents.ts` does the handoff. A
`Repair` fails the command while findings remain, and a `Task`, such as harden, is work that the
user can decline. The command decides its mode once, with `Mode.provide` from
`src/terminal/mode.ts`, and a command that decides none prints as `Plain`:

| Mode    | When                                                 | The offer                                                                                                |
| ------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Json`  | With `--json`.                                       | Prints the command's JSON document on standard output. The command never asks and never starts an agent. |
| `Menu`  | When the terminal can prompt and the user allows it. | Shows the resolution menu of `src/terminal/resolution-menu.ts`.                                          |
| `Plain` | Otherwise.                                           | Prints the Markdown prompt.                                                                              |

`CodingAgents.detectInstalled` probes the CLI of each entry of `codingAgents` and keeps the order of
the list for the menu. A CLI that starts and exits within 10 seconds is installed, whatever its
output or exit code. `CodingAgents.handoff` starts the agent with the prompt in its arguments and
the standard streams of the terminal. A Ctrl-C sends SIGINT to the agent and to Adamantite, and
Adamantite ignores the signal until the session ends. The handoff discards the exit code of the
agent.

| Invariant                                                                                                            | Held by                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| After an agent session, only the command's `verify` decides success.                                                 | The tests in `src/commands/__tests__`                                                 |
| The handoff passes no permission, sandbox, or trust flag of a coding agent.                                          | Nothing                                                                               |
| With `--json`, standard output holds only the JSON document, which decodes with the Schema that the command exports. | The tests in `src/commands/__tests__`, and `scripts/test-smoke.ts` for the packed CLI |

## Reading configs, comments, and syntax trees

Adamantite takes each fact about the target project from the tool that owns it, and does not parse
source text. Nothing enforces it.

| Fact                                               | Source                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A tool config                                      | The `ConfigLoader` service in `src/lib/project/config-loader.ts` imports the config with Node.js in a separate process, as Oxlint imports it. Each preset and each `custom()` result names itself under the symbol of `presets/identity.ts`, so a preset counts also through a spread. `src/lib/project/__tests__/config-loader.test.ts` runs the real loader, and the unit tests use `src/__tests__/config-loader.ts`. |
| The disable comments and the syntax tree of a file | The probe plugin, `src/oxlint/probe.ts`, reports them from Oxlint's parser, and `src/lib/integrations/oxlint/probe.ts` runs it.                                                                                                                                                                                                                                                                                         |
| The files that Oxlint lints, and its reports       | `src/lib/integrations/oxlint/files.ts`                                                                                                                                                                                                                                                                                                                                                                                  |

`ConfigLoader.load` runs each config in its own Node.js process, so a later load reads the files
again after a coding agent changes a module that the config imports. The loader captures the output
of the process, so the output of the config does not mix into the output of a command. When no
result decodes, the failure gives the standard error of the process as its reason, which a command
such as `rule test` prints. The process runs in the folder that `adamantite check` starts Oxlint
in, so a config that reads a file through `process.cwd()` reads the file that Oxlint reads. It
prints the encoded default export after a marker, apart from what the config prints. It passes
`--debug=files`, the argument of Oxlint's read-only file listing, so `custom()` writes the entry
module of a rules folder outside the project. `ENCODE_SOURCE` copies the identity of each preset and
each `custom()` result under the `$adamantite` key, because JSON drops symbol keys, and writes a
regular expression, which Knip accepts in place of a name, as `{ $regexp, flags }`. The in-memory
loader of the unit tests runs the same source. `readConfig` gives a config that does not load, or
that its schema rejects, as a failed `Result`, because a finding reports it.

`src/lib/project/lint-config.ts` reads a loaded Oxlint config. Its schema leaves the setting of each
rule unknown, so a setting that Adamantite does not read never fails the decode of a config that
Oxlint loads. A preset that a config spreads into its own object counts at the place of that object.
An override that spreads a preset names the preset itself, and an override that spreads the `rules`
of a preset, as the documentation of the jest and vitest presets shows, names it in `rules`. A
config that spreads a preset, such as `{ ...core, overrides }`, keeps the identity of the preset on
its own object, so `listOverrides` cannot tell the overrides of the project from those of the
preset.

`ModuleResolver` in `src/lib/project/module-resolver.ts` resolves a specifier to the file that
Node.js loads. `addRootDevDependencies` in `src/lib/project/dependency-installer.ts` clears its
cache after each install.

## Command boundaries

Each command is one module of `src/commands`:

| Command        | Work                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`, `fix` | Run Oxfmt and Oxlint through the bridge, `src/lib/bridge/index.ts`. `check` fails on Oxlint warnings unless `--allow-warnings` is set.                                                         |
| `analyze`      | Run Sherif in a detected monorepo, then Knip, through the bridge.                                                                                                                              |
| `init`         | Add the selection of its prompts or flags to the recorded selection, and run `applySetup`.                                                                                                     |
| `update`       | Run `applySetup` with the recorded selection.                                                                                                                                                  |
| `doctor`       | Assess the project, and offer the repair of its findings.                                                                                                                                      |
| `harden`       | Offer a prompt that tells a coding agent to move the project's coding standards up the enforcement ladder, from the facts that `src/lib/hardening/index.ts` computes. It produces no findings. |
| `rule`         | Write a custom rule stub, print a syntax tree, run the saved rule tests, and run a trial in a copy of the project through `src/lib/hardening/trial.ts`.                                        |

By default, `check` fails on Oxlint warnings, because agents copy the code that they read, and a
warning that passes `check` spreads like code that has no report. It runs its stages before it
compares the lockfile version, so an agent that runs `check` after an edit reads the reports of its
code before the setup repair. A lockfile that fails with `InvalidLockfile` or `UnsupportedLockfile`
leaves the stages as without a lockfile, and Doctor reports it.

Without a lockfile, `update` has no selection to apply, so it offers the one finding, which names
`adamantite init`.

In a target project, `harden` runs only when the Adamantite version in `node_modules` is the
running version, because the prompt offers the presets and rules of that version. The Adamantite
repository does not install itself, so there `harden` compares the running version with the
`version` of the root `package.json`, and does not check `node_modules`. After an agent session,
`verify` in `src/commands/harden.ts` runs the checks of the bridge, reads the project again, and
assesses it. A failed check, or a finding that remains, fails the session. A failed command already
printed its report, so only another failure, such as a missing tool, adds its message. A link that
was broken before the session, or a line of the decisions record that did not decode before it, is
a gap that the user may not have approved, so a broken link or an undecodable line fails the
session only when the session added it. A line has no key that survives a repair, so `verify`
compares the text of the lines.

The bridge runs its stages through `CommandRunner` in `src/lib/shared/command-runner.ts`. A stage is
an effect that finds its command, such as the Oxlint stage, which resolves the Oxlint runtime of the
project, and a stage that finds no command prints no section. `runAll` runs every stage in order,
then fails with the first failure, and `runUntilFailure` stops at the first failure.
`runConcurrently` finds every command before any command starts, starts them together, and prints
each section after the sections before it, so its output reads as the output of `runAll`. It fails
first with a stage that found no command, because the stages that ran already printed why they
failed.

- `check` runs the format stage and the lint stage at the same time, because both only read files.
  It prints a heading above each stage only on a plain run. With `--only`, forwarded arguments, or
  the agent report of Oxlint, the output is the tool's own, such as JSON that a script parses, and a
  passing lint with the agent report prints nothing, so a heading would end the output with no
  result.
- `fix` runs the lint stage before the format stage, so `quality/require-readable-spacing` counts a
  line past the print width as multiline before Oxfmt wraps it.
- `analyze` runs Sherif only in a monorepo. A project without a usable `package.json` has no
  monorepo, and Knip reports the manifest. Another read failure, such as of `pnpm-workspace.yaml`,
  could hide a monorepo, so it fails the command. With `--fix`, the stages stop at the first
  failure.

A missing tool fails with `CliNotFound` when the tool runs from `PATH`, and with
`PackageNotInstalled` when Node.js starts it from the project. The bridge replaces the failure with
`ToolNotSelected` when the recorded selection includes no script that runs the tool, because
`update` would not install it. The Oxlint entry does the same for Oxlint.

| Invariant                                                                                                                                                                                                                   | Held by                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Only `check`, `fix`, and `analyze` forward the arguments after `--`. The bridge gives them to one stage: the lint stage, the unused stage of `analyze`, or the stage that `--only` selects.                                 | `src/__tests__/cli.test.ts`, for the commands, and the tests in `src/commands/__tests__`, for the stage |
| A missing tool that no selected script runs fails with `ToolNotSelected`, which names the `init` command that adds the script.                                                                                              | The tests in `src/commands/__tests__`                                                                   |
| A trial changes no file of the project.                                                                                                                                                                                     | `src/lib/hardening/__tests__/trial.test.ts`                                                             |
| `harden` fails before it computes its context when the Adamantite version that it reads is not the running version. It reads the version from `node_modules`, or in the Adamantite repository from the root `package.json`. | `src/commands/__tests__/harden.test.ts`                                                                 |
| A broken link or an undecodable line of the decisions record fails the session of `harden` only when the session added it.                                                                                                  | `src/commands/__tests__/harden.test.ts`                                                                 |
| `rule try` exits 0 when each case is as expected, 1 when a case is not, and 2 when the trial is not evidence.                                                                                                               | `src/commands/__tests__/rule.test.ts`                                                                   |
| Oxlint applies one pass of fixes, so some fixes need a second `fix`, until Oxlint repeats its passes ([oxc#16118](https://github.com/oxc-project/oxc/issues/16118)).                                                        | `secondPasses` in `presets/__tests__/idioms.ts`, which `src/lib/bridge/__tests__/index.test.ts` reads   |

## Hardening

`readHardenContext` in `src/lib/hardening/index.ts` computes the facts of a harden session, and
`renderHardenPrompt` renders them into the prompt. `harden --json` prints the facts as the
`HardenContext` schema encodes them. Build macros in `src/lib/hardening/harden-prompt.macro.ts`
inline `harden-prompt.md` and the enforcement ladder of the `adamantite-hardening` skill, so the
prompt and the skill state the ladder from one file.

### Scope

A `--path` scope keeps the workspace packages inside the folder, or the innermost package that
contains it, which owns each of its files. For each kept package, the context keeps the nearest
config that discovery finds in the package or in an ancestor package, and the rules folders that
those configs load, also outside the scope. A nested config in a folder that is not a workspace
package is not on the list, although Oxlint uses it for the files below it. It keeps the Markdown
files outside each workspace package too, because the root documentation applies to every package.
`unloadedConfigs` lists each config that Node.js cannot load, because only the agent can find the
rules folders that its `custom()` calls load.

### Documentation reach

Each coding agent starts from `AGENTS.md`, so harden starts the traversal from no instruction file
of one vendor, such as `CLAUDE.md`. Such a file is still documentation, and a reference can reach
it. The documentation is each Markdown file that git lists and the working tree has, except the
changesets, the changelogs, and the skill folders of the coding agents, because an agent finds its
skills on its own. `readAgentReach` in `src/lib/hardening/agent-reach.ts` follows the references
from the `AGENTS.md` files that an agent in the scope reads: the ones above the scope and inside it,
but not the ones of a sibling package. It reads the whole project, because a root file can link to
the files of each package.

- A Markdown link resolves from the folder of its file, or from the root when it starts with `/`.
- A code span resolves from the folder of its file, then from the root, because instructions often
  name a root path.
- A reference to a folder reaches each Markdown file directly in it. A folder of code, such as
  `src/lib`, does not point to the docs below it.
- A fenced code block and a code span hold examples, so their links do not count.

The reach lists the Markdown files that no chain of references reaches, the links to Markdown files
that do not exist on disk, and the links whose anchor matches no heading. Adamantite does not render
Markdown, so each heading gives two candidate anchors in GitHub's slug: the text as written, and the
text without link targets, HTML tags, and emphasis underscores. A repeated heading adds `-1`, `-2`,
and so on, and an explicit id, such as `{#tests}` or an HTML `id`, is an anchor too. Only the
headings of a file that git lists are known, so a link to another file keeps its anchor unchecked.
A heading with other markup can still miss, so the agent checks each unmatched anchor. Harden does
not check the paths that code spans name, because docs name example paths, the paths of a target
project, and files that a plan creates.

### Suppressions

`readSuppressions` in `src/lib/hardening/suppressions.ts` counts the disable comments of each rule
and the comments of each TypeScript directive in the files that Oxlint lints in the scope. The
probe plugin reads the comments of each file whose text has `-disable` or `@ts-`. A disable comment
that names no rule counts under no rule, because it turns off all rules. Each location is
`<file>:<line>`, with the file relative to the project root. Each list puts the rule or the
directive with the most comments first, and the prompt shows up to five locations of each.

### Override trials

`readOverrides` in `src/lib/hardening/overrides.ts` reads each override that turns a rule off, and
lints the files that it names inside the scope in a copy of the project.
`renderOverrideTrialConfig` removes only the rule from the override, so the setting of the earlier
layers applies again. The rule stays off when no earlier layer turns it on, or when another
override still turns it off. Each file gets a mark:

| Mark         | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `breaks`     | The rule still reports the file.                                                         |
| `clean`      | The rule no longer reports the file. Only a file that Oxlint linted and parsed is clean. |
| `ignored`    | The config ignores the file.                                                             |
| `missing`    | The file does not exist.                                                                 |
| `unparsable` | Oxlint cannot parse the file.                                                            |

A glob is a scope decision, so harden lists the globs of an override and does not expand them. A
file that a glob matches is linted only when an override also names it literally.
A config that does not load has no override to read, and Doctor reports it.

### Rule trials

`tryRule` in `src/lib/hardening/trial.ts` lints cases in a copy of the project, with the rule at
the project's setting or at `error` with given options, and returns the reports of the rule on each
case. `rule try` reads a case as a project path, or as `<path>=<file>` to lint the content of
`<file>` at `<path>`. The cases run in rounds in which each path appears once, so two cases can
share a path, such as the code before and after a fix.

`makeProjectCopy` makes the copy in a temporary folder that the scope removes. The copy has the
files that git lists and the working tree has, with their uncommitted changes, and none of the
files that git ignores, except those of a linked package inside the project, such as the build
output that its `exports` name. A linked package can be any project folder outside `node_modules`,
not only a workspace package. The `node_modules` folder of the root and of each workspace package
is a real folder in the copy, with a link for each package of the original folder except `.cache`,
so the entry modules that `custom()` writes to `node_modules/.cache` stay in the copy. A scope
folder, such as `@acme`, is a real folder too, with a link for each of its packages. A package that
links to a project folder links to the copy of the folder.

`replaceConfigs` takes only a `ProjectCopy`, which only `makeProjectCopy` makes. It moves each
config that the caller names to `oxlint.trial-base.config` in the same folder, with the extension
of the config, so its relative imports and `custom()` calls still work. In its place, it writes the
config that the caller renders, which imports the moved config. A rule trial adds the trial setting
as the last override, and an override trial removes the rule from the overrides that turn it off.

### Decisions record

`.adamantite/decisions.jsonl`, beside the lockfile, is the memory of harden. A monorepo has one
record at the workspace root, also when `--path` selects a package. The coding agent appends to it
after the user answers a session, as step 8 of the prompt says, and Adamantite never writes it. Its
keys tell its two kinds of lines apart:

- A decision line has an `id`. A decision is its `id` together with its `scope`, so a standard can
  have a decision for the project and another for a folder. A later line replaces an earlier line
  of the same `id` and scope. An `approved` line ends the decision, and a `decided` line resolves
  an item of the Decisions list, with the choice in `reason`.
- A session line has the `session` date, and it can have the `head` commit that the session read
  the history up to and the `scope` of the session. A session of the whole project has no `scope`.
  A session has no `head` when it read a `--commits` count, or when git cannot resolve `HEAD`.

`readDecisionsRecord` in `src/lib/hardening/decisions-record.ts` keeps the last line of each `id`
and scope, and leaves out a decision whose last line is `approved`. A scope keeps a decision without
a scope, and a decision whose scope contains the scope of the session or lies inside it. A `scope`
decodes only as the harden context writes it, so another spelling of the same folder, such as
`./packages/web`, does not decode. A line that does not decode is listed for the agent to repair.

### Fix history

The agent reads the commits of the fix history for fixed mistakes. The prompt gives a `git log`
command with `--no-merges` and the scope as a pathspec, or `.` for the whole project, so a count or
a range applies only to the commits that are not merges and change a file in the scope.
`--commits` sets a count. Without it, the history starts after the common ancestor of `HEAD` and
the `head` of the last session line with a `head` that covers the scope, which `findCoveringSession`
gives. A line covers a scope when it has no scope, or when its scope is that folder or a parent of
it. Without such a line, or without a common ancestor, the history is the last 200 commits.

The boundary skips no commit that came after the earlier session. The boundary is an ancestor of
`head`, so `git log <boundary>..HEAD` lists each commit that the filters keep and that is reachable
from `HEAD` and not from `head`. A commit that is reachable from `head` stays out of the range, also
when the earlier session did not read it because its count left the commit out. While `head` is an
ancestor of `HEAD`, the range is exact. After a squash or a rebase, the range can list some commits
again.

A session that reads the default count or the commits after a boundary records `HEAD` in its
session line. A session that reads a `--commits` count records no `head`, because it can leave out
older commits, so later sessions start from an earlier session line.

| Invariant                                                                                                     | Held by                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A line of the decisions record that does not decode hides no other line.                                      | `src/lib/hardening/__tests__/decisions-record.test.ts` |
| The decision line schema grows only by optional keys, so an older Adamantite reads the record of a newer one. | Nothing                                                |
| Harden produces no findings, so it never changes Doctor's result.                                             | Nothing                                                |

## Preset layout

```text
presets/
  __tests__/        the stack and fixture tests, and the fixture packages
  identity.ts       the symbol key under which each preset and custom() result names itself
  lint/             published Oxlint presets
    plugins/        first-party Oxlint plugins, one folder for each rule namespace
      entry.ts      the jsPlugins entry of each plugin, for the presets
      shared/       helpers that more than one plugin uses
      adamantite/   the adamantite rules
      quality/        the quality rules of the strict preset
      quality-effect/ the quality-effect rules of the effect preset
      testing/        the testing rules of the strict preset
  rules/            published rules-folder preset, authoring API, loader, and test API
  analyze.ts        published Knip preset
  format.ts         published Oxfmt preset
  tsconfig.json     published TypeScript preset with strict options
  typescript.json   published TypeScript preset with strict options and ts-reset types
  typescript/
    resets/         first-party type resets
```

Adamantite reads the configs of a target project by loading them, as Oxlint, Oxfmt, and Knip do, so
it sees plain objects and not the imports that built them. Each preset object therefore names its
public module under `PRESET`, the `Symbol.for("adamantite.preset")` key of `presets/identity.ts`.
`Symbol.for` gives one key to every installed copy of Adamantite, and a spread copies the key, so a
config such as `{ ...analyze, ignoreDependencies }` keeps it. The tools ignore the key: Oxlint and
Oxfmt send the config to Rust as JSON, and Knip reads only string keys. `presets/analyze.ts` and
`presets/format.ts` write the key with `Symbol.for`, because `presets/tsconfig.json` sets the
options of their folder and does not allow a value import with a `.ts` extension.

| Invariant                                                                                                | Held by                              |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `adamantite/analyze`, `adamantite/format`, and each lint preset name their public module under `PRESET`. | `presets/__tests__/identity.test.ts` |

## Dependency version invariant

An integration records the version of each package that Adamantite installs in target projects,
from the build-time version of the dependency in `package.json`. Packages that belong to Oxlint sit
under `src/lib/integrations/oxlint`: tsrs beside the integration, and the managed plugins in
`src/lib/integrations/oxlint/plugins`. The Oxlint integration installs tsrs and the managed plugin
of each selected preset. `getDependencyVersion` in `src/lib/shared/version.macro.ts` fails the build
for a package that `package.json` does not declare.

## Lint presets

`LINT_PRESETS` in `src/lib/project/selection.ts` is the one list of the presets that a target
project can select besides core, in the order that `init` offers them, and
`src/lib/integrations/oxlint/presets.ts` gives each one a definition. The list sits in `project`
because the `Selection` schema needs it below the integrations. The [README](../README.md#presets) describes what each preset checks.

`jest` and `vitest` put their rules in one override for their `testFiles`, and keep `plugins` and
`rules` as properties that `Object.defineProperties` does not make enumerable. Oxlint reads a config
through `JSON.stringify`, which skips them, so a config that extends the preset gets only the
override, and a project can spread `plugins` and `rules` into an override of its own. The rules
name the preset under `PRESET` too, so Doctor counts such an override as the preset. The two presets
load no first-party plugin, because a project override that copies their `plugins` and `rules`
would not load it. `strict` turns on its assertion and testing rules for the `testFiles` of both
presets, so the presets agree on what a test is.

The `effect` preset turns on the native `effecttsgo` rules of `@effect/tsgo`, which only the Effect
builds of the Oxlint binding and of tsrs have. It enables the rules that report Effect code, and none
that bans a platform API in code that is not Effect code. `EXCLUDED_RULES` in
`presets/__tests__/effect.test.ts` lists each rule of the four category presets of `@effect/tsgo`
that the preset leaves out, with the reason, and the test fails when a category preset adds a rule
that is in neither list. The preset also enables every rule of the first-party `quality-effect`
plugin.

| Invariant                                                                                                                                                                                                                              | Held by                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Each preset of the list has a definition and a file in `presets/lint`.                                                                                                                                                                 | The type of `definitions`, and `src/lib/integrations/oxlint/__tests__/presets.test.ts`                                |
| `package.json` exports core as `adamantite/lint` and each preset as `adamantite/lint/<name>`, without a wildcard, so the other modules below `presets/lint` stay private. The export map, the list, and the README import table agree. | `src/lib/integrations/oxlint/__tests__/presets.test.ts`, `src/__tests__/exports.test.ts`, and `scripts/test-smoke.ts` |
| CLI code gets a public import from `publicImport()` in `src/lib/shared/package-exports.ts`, which accepts only a key of the export map. Prose in findings and prompts keeps literal imports.                                           | The type checker. Nothing rejects a literal import.                                                                   |
| A config that extends `jest` or `vitest` gets their rules only in the test files, and a project override that spreads its `plugins` and `rules` gets each rule.                                                                        | `presets/__tests__/jest.test.ts` and `presets/__tests__/vitest.test.ts`                                               |
| Each lint preset besides core is in a stack of `presets/__tests__/stacks.ts`.                                                                                                                                                          | `presets/__tests__/stacks.test.ts`                                                                                    |
| Each `effecttsgo` rule of the `effect` preset is in a category preset of `@effect/tsgo`, and the preset decides on each rule of those presets.                                                                                         | `presets/__tests__/effect.test.ts`                                                                                    |
| A preset that lists another in `excludes` is listed in the `excludes` of that preset too.                                                                                                                                              | `src/lib/integrations/oxlint/__tests__/presets.test.ts`                                                               |

## Managed plugins

A preset can need a third-party Oxlint plugin from npm, such as `@shadcn/lint` for `tailwind`.
`src/lib/integrations/oxlint/plugins` holds one definition for each, and
`src/lib/integrations/oxlint/runtime.ts` resolves the Oxlint runtime, with the native parts that a
plugin replaces.

`src/lib/integrations/oxlint/presets.ts` names the plugin of each preset. `oxlintPlugins` in
`src/lib/integrations/oxlint/plugins/index.ts` collects them for the runtime, and `managedPlugins`
in `src/lib/integrations/oxlint/plugins/managed.ts` adds the managed versions. Setup installs the
package of a selected preset for both `init` and `update`, whether or not a config applies the
preset. `defineManagedPlugin` in `src/lib/integrations/oxlint/plugins/define.ts` builds each plugin
on `definePackageTooling`, as tsrs is built, so Doctor requires the package only while a managed
script runs Oxlint and a config of the project applies the preset.

A plugin has a `JavaScriptRuntime` when Oxlint loads it through the `jsPlugins` entry of its
preset, which resolves from the target project. It has a `NativeRuntime` when its rules exist only
in a native build of Oxlint. The `resolve` of a native runtime gives the overrides of the runtime
parts, or none when the project does not install the plugin package.

`resolveOxlintRuntime` gives an `OxlintRuntime`: the folder of the Oxlint package, the native
binding, and the type-aware backend. The binding is `Stock`, or `Replaced` with the variables and
the `preload` module that swaps Oxlint's binding for the build of the plugin. The backend is one of
these:

| Backend    | Meaning                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `None`     | No `node_modules/.bin` has a tsrs launcher. Oxlint runs as installed, and fails only when it runs a type-aware rule. |
| `Tsrs`     | Oxlint starts the installed tsrs through the nearest `tsrs-lint` launcher of the project.                            |
| `Replaced` | Oxlint starts the backend of a plugin, with the variables of the plugin.                                             |

An override replaces the whole backend, so the variables of the default and the native backends
never mix. The project must install its own backend, so a launcher on `PATH` does not count.
`toLaunch` turns the runtime into an `OxlintLaunch`, in which a variable without a value is removed
from the environment. `getOxlintCommand` in `src/lib/integrations/oxlint/entry.ts` has Node.js load
the preload module and then start Oxlint's CLI module, so the CLI loads Effect once, and no entry
process resolves the runtime again.

`@effect/tsgo` is the one native plugin. `resolveEffectRuntime` in
`src/lib/integrations/oxlint/plugins/effect-tsgo/runtime.ts` takes the Effect builds of the Oxlint
binding and of tsrs, for the installed versions, from the platform package of `@effect/tsgo`, so
the project needs no patch. The installed package turns the builds on, so a nested config and a
relative preset import get them too.

`assessOxlintRuntime` in `src/lib/integrations/oxlint/runtime-assessment.ts` reports a runtime that
the installed packages cannot supply, and the package findings report the declarations and the
managed versions. A project that declares tsrs, but whose launcher does not resolve, gets a
finding, although the entry still runs Oxlint without tsrs.

| Invariant                                                                                                                                                                                                                                      | Held by                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Each plugin package has a managed version.                                                                                                                                                                                                     | The type of `versions` in `src/lib/integrations/oxlint/plugins/managed.ts`                                |
| No module that the Oxlint entry loads imports a version macro, so the entry runs from source.                                                                                                                                                  | The `presets` tests, which start `src/oxlint/index.ts` through `presets/__tests__/rule-fixtures.ts`       |
| One resolver serves the CLI, the Oxlint entry, and Doctor, so `src/lib/integrations/oxlint/runtime-assessment.ts` reports what a lint run finds.                                                                                               | Nothing holds the shared use. `src/lib/integrations/oxlint/__tests__/runtime.test.ts` holds the resolver. |
| The resolver reads files and changes nothing. Only a process that starts Oxlint applies the `OxlintLaunch` of a runtime: the CLI starts Oxlint's CLI module with it, and the Oxlint entry, which editors start, applies it in its own process. | Nothing                                                                                                   |
| Only the Effect plugin replaces native parts, so no two overrides replace one part.                                                                                                                                                            | Nothing                                                                                                   |
| When `@effect/tsgo` has no build of either installed version, the resolver reports the missing tsrs build.                                                                                                                                     | `src/lib/integrations/oxlint/__tests__/runtime.test.ts`                                                   |

## Type resets

`adamantite/typescript` loads the type resets in `presets/typescript/resets`, through
`presets/typescript/resets/index.d.ts`. The resets change the types of built-in APIs. Doctor
reports a library that loads them, from `src/lib/integrations/typescript/index.ts`.

| Invariant                                                                                                                                                                                                    | Held by                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| Each reset has a fixture of type tests in `src/__tests__/presets/fixtures/typescript` that passes with `adamantite/typescript` and fails with `adamantite/tsconfig`, and `index.d.ts` references each reset. | `presets/__tests__/typescript.test.ts` |
| The build ships each file that the built preset loads.                                                                                                                                                       | `scripts/test-build.ts`                |

## First-party plugins

Adamantite has four Oxlint plugins of its own in `presets/lint/plugins`: `adamantite`, `quality`
and `testing` for the `strict` preset, and `quality-effect` for the `effect` preset. A preset gets
the `jsPlugins` entry of a plugin from `firstPartyPlugin` in `presets/lint/plugins/entry.ts`. The
`architecture` preset loads the `adamantite` plugin without enabling rules, because
`adamantite/layers` and `adamantite/import-owners` need options from the target project. A preset
loads a first-party plugin by a file URL inside this package, and names a managed plugin, such as
`@shadcn/lint`, by its package, which resolves in the target project.

Oxlint loads a plugin by file URL from the Adamantite package, so a target project installs
nothing more. `entry.ts` imports no plugin code, so a preset loads no rule module. Each plugin
folder holds an `index.ts` that registers the rules, a `rules` folder with one module for each
rule, and, when the plugin needs one, a `shared` folder with the helpers that only that plugin
uses.
`presets/lint/plugins/shared` holds the helpers that more than one plugin uses.

`quality` started as a copy of [anti-slop](https://github.com/dmmulroy/anti-slop),
`quality-effect` as a copy of its Effect rules, and `testing` as a copy of
[landmines](https://github.com/interfere-inc/landmines). The `license.md` of each folder keeps the
license of its source. `testing` drops the per-file allowlists of landmines: a file that needs an
exception suppresses the rule with a reason, as `adamantite/require-suppression-reason` asks.

`Replacement` in `presets/lint/plugins/shared/replacement.d.ts` is the type of `meta.docs.replaces`.
Doctor counts the `overrides` entries that turn on one of `rules` and set the property that `option`
names to a non-empty array. It warns when the count reaches `minimum`, and the warning says what the
entries state, from `states`, and gives the `steps` that move them into the rule. Doctor names the
replaced rule by the first name in `rules`. The type is in a declaration file, so the build ships no
module for a type that only the rules and Doctor read.

### Import resolution

`adamantite/layers` and `adamantite/import-owners` resolve imports with `resolveImport` in
`presets/lint/plugins/adamantite/shared/resolver.ts`, so both rules share its extensions,
`tsconfig.json` paths, and default conditions. A layer map can add conditions of its own, so
`layers` can reach another file than `import-owners` for the same import. `identifyPath` keeps a
path through `node_modules` as it is, so a linked workspace package keeps its package. It gives
every other path its real path, so a symlink cannot give a protected file a second path. A rule
identifies both paths of a comparison, so a project below a linked folder, such as `/tmp` on macOS,
compares a real path with a real path. `layers` does not check an import that does not resolve,
because TypeScript reports it. `import-owners` matches such an import only by its text.

### Layer maps

`createLayersRule` in `presets/lint/plugins/adamantite/rules/layers.ts` activates each map whose
root glob matches a folder above the linted file. `splitAtRoot` takes the shortest match, so `**`
matches zero or more folders above the root. A nested map activates from the concrete folder that
its parent matched, before any `ignore` of the parent. Each active map checks an import with its
own entries, ignores, isolation, type-import setting, and conditions. Two maps with the same
concrete root report `duplicateMap` and check nothing.

A dependency, or a file outside the package, is outside every map, even below a `.` root. No layer
imports an entry. A file of a map that is in no layer is reported, and so is each import that
reaches it from a file in a layer of that map. In an isolated layer, a file and the folder of the
same name, such as `routes/settings.tsx` and `routes/settings/`, are one unit.

The message of a violation names the repairs. `findLowerRepairs` gives the highest layers that both
sides import, where the code that both need can move. `findUpperRepairs` gives the lowest layers
that import both sides, where the importing file can move. For two units of one layer, the layer
itself does not count.

### Import owners

`createImportOwnersRule` in `presets/lint/plugins/adamantite/rules/import-owners.ts` reads owner
paths from the workspace root: the nearest folder with a `pnpm-workspace.yaml` that has a `packages`
key, or with a `package.json` that has a `workspaces` field. Outside a workspace, it reads them from
the nearest folder with a `package.json`. A `package.json` that does not parse lists no workspace,
because the package manager reports it. A message names the kind of root, not its path, because the
path is different on each machine.

The start of the `import` option sets how the rule matches an import:

| Kind      | Example        | The rule matches                                                                                                                                                       |
| --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package` | `giget`        | The import as written, and its subpaths.                                                                                                                               |
| `alias`   | `#lib/db`      | The import as written, and each import that resolves to the module. The alias resolves from the root, so the text match also catches the alias of a workspace package. |
| `path`    | `./src/lib/db` | Each import that resolves to the module, because the text of a relative import depends on the file that has it.                                                        |

The module of an option resolves from the root, as owner paths do, in the resolution mode of the
import. A folder module resolves only through a file in it, so `covers` tries each tail of the
file's path below the module, in each name that an alias can give the file: the path, the path
without its extension, and the folder of an index file. The tails come from the path and from the
real path, because a link can give the file a name in the module that its real path lacks.

### Scope analysis

A rule that needs the scope analysis to resolve a name, such as `quality/no-widen-then-assert` and
`quality/no-known-value-widening`, first collects the names that a report needs, so most files never
build it. `withTypeBindings` in `presets/lint/plugins/quality/shared/type-alias-resolution.ts`
records the type bindings of a file during Oxlint's own traversal. The first rule that uses it
records them once for each program, and the other rules read the same bindings. It runs each
deferred check at the end of the file, when a type declared after its use is known too.

### Readable spacing

`quality/require-readable-spacing` configures the vendored rule in
`presets/lint/plugins/quality/stylistic`, which its `UPSTREAM.md` describes. `adamantite fix` runs
lint before Oxfmt, so the rule predicts the lines that Oxfmt writes. A statement on one line that
ends past `printWidth` counts as multiline, because Oxfmt usually wraps it. The rule cannot know
what Oxfmt will do. If Oxfmt keeps that line, as for a long template literal, the statement only
gets blank lines that the policy allows. The rule measures the line as written, so it can miss a
wrap when Oxfmt makes the line longer, for example when it changes `{a:1}` to `{ a: 1 }`, indents
the line deeper, or expands tabs.

| Invariant                                                                                                                                                                                                             | Held by                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The folder name of a plugin is its rule namespace and its `meta.name`.                                                                                                                                                | `presets/lint/plugins/__tests__/entry.test.ts`                                                                                         |
| Rule code runs under the runtime that executes Oxlint in the target project. It imports only types from `@oxlint/plugins`, and its one runtime package is `oxc-resolver`.                                             | The preset build in `tsdown.config.ts`, which fails when it bundles another package. Nothing rejects an API that only one runtime has. |
| `presets/lint/plugins/tsconfig.json` lets the source import rule modules with their `.ts` extension, which Node.js needs to load a plugin from source.                                                                | The `presets` tests                                                                                                                    |
| Each rule has a RuleTester test, and a `valid` and an `invalid` fixture that a real Oxlint run lints through `presets/__tests__/rule-fixtures.ts`. [Place a test](../CONTRIBUTING.md#place-a-test) names the folders. | `presets/__tests__/stacks.test.ts`, for the fixtures. Nothing requires the RuleTester test.                                            |
| No rule of a stack reports a valid fixture, and each invalid fixture gets the report of its rule. A report that stays is in `knownReports`.                                                                           | `presets/__tests__/stacks.test.ts`                                                                                                     |
| No two presets set one rule, unless one of them is core. Each core rule that a preset changes has a fixture that gets a different result from core alone.                                                             | `presets/__tests__/overlap.test.ts`                                                                                                    |
| The fixture packages in `presets/__tests__/fixture-packages` are a separate pnpm workspace, and no package is in both manifests.                                                                                      | `presets/__tests__/fixture-packages.test.ts`, for the manifests. Nothing checks the workspace file.                                    |
| A rule declares the hand-written config that it replaces in `meta.docs.replaces`, so `src/lib/integrations/oxlint/replacements.ts` names no rule.                                                                     | `src/lib/integrations/oxlint/__tests__/replacements.test.ts`                                                                           |
| Each license notice below `presets`, outside the `__tests__` folders, ships at the same path in `dist/presets`, because some plugin rules started as copies of MIT-licensed code.                                     | `scripts/test-build.ts`                                                                                                                |
| Each plugin file that a built lint preset loads by a file URL exists after the build.                                                                                                                                 | `scripts/test-build.ts`                                                                                                                |
| `presets/lint/plugins/entry.ts` imports no plugin code.                                                                                                                                                               | Nothing                                                                                                                                |
| A helper moves to `presets/lint/plugins/shared` only when a second plugin needs it.                                                                                                                                   | Nothing                                                                                                                                |
| Each kind of layer map error has the data of its message.                                                                                                                                                             | The type checker, because the `switch` of `getMapErrorData` has no default                                                             |
| The default `printWidth` of `quality/require-readable-spacing` is the `printWidth` of `adamantite/format`.                                                                                                            | The rule reads the `printWidth` of `presets/format.ts`                                                                                 |
| A safety marker of `quality/require-safety-comment-for-type-assertion` is not blank.                                                                                                                                  | The option schema of the rule                                                                                                          |

## Custom rules

Custom rules are Oxlint rules that the target project writes in a rules folder, by default
`.adamantite/lint`. `presets/rules` is the published side: `custom()`, the loader, the authoring
API, and the test API. `src/lib/project/custom-rules` is the CLI side: the discovery of the
`custom()` calls that the loaded configs reach, the stub of `rule add`, and the saved tests of
`rule test`. `skills/adamantite-hardening/references/custom-rules.md`, which the "Custom rules"
section of `skills/adamantite-hardening/SKILL.md` links to, tells an agent how to write and verify
a rule.

`custom()` in `presets/rules/custom.ts` runs while Oxlint loads the config. It finds the file that
called it in the stack, resolves `dir` from that file, and turns on each rule file that
`listRuleFiles` in `presets/rules/folder.ts` lists: a regular file directly in the folder, not a
symlink, whose extension is `.js`, `.mjs`, `.mts`, or `.ts`, that is not a declaration or a test
file, and whose name does not start with `_`. Helpers live in `_` files and in subfolders. Oxlint
then loads an entry module that calls `loadRules` from `presets/rules/load.ts` for the folder.
`presets/rules/folder.ts` holds what `custom()`, `loadRules`, and the CLI share, and the export map
does not list it.

`writeEntryModule` writes the entry module to `node_modules/.cache/adamantite` above the rules
folder, or to a folder in the OS temporary directory that only the current user can write. The
file name hashes the folder, the plugin name, and the URL of `loadRules`, so each rules folder and
each installed copy of Adamantite gets its own file. Oxlint's `--debug=files` run, which the file
discovery of Adamantite uses, writes the entry module to the temporary folder, so discovery changes
nothing in the project. The result names the folder, the plugin, and the caller under `PRESET` also
when the folder holds no rule, so Adamantite finds each rules folder that a loaded config reaches.

`adamantite/rules/testing` connects RuleTester to `node:test`, so a rule test reports each case and
sets the exit code. It is a separate export from `adamantite/rules/plugin`, so importing
`adamantite/rules/plugin` does not load `node:test`.

`discoverCustomRules` in `src/lib/project/custom-rules/discover.ts` loads the Oxlint configs that
lint the given folders, as Oxlint loads them, so a `custom()` call in a module that a config
imports, such as the entry module of a shared tooling package, counts, and a call in a module that
no config imports does not. Each config loads in the project root. A config that does not load is
in `unloadedConfigs`, with its reason. `readCustomRuleTestCommand` in
`src/lib/project/custom-rules/index.ts` builds a `node --test` command for the saved tests of each
rules folder that a call loads, also in a Bun project, and `rule test` in `src/commands/rule.ts`
runs it.

| Invariant                                                                                                                                                         | Held by                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `custom()` and the loader use only the Node.js APIs that Bun also provides.                                                                                       | `presets/__tests__/custom.test.ts`, in real Oxlint runs under Node.js, and the `test` workflow, with the minimum Bun |
| A project type-checks its rules without `@oxlint/plugins`, because the build inlines the authoring types.                                                         | `scripts/test-smoke.ts`                                                                                              |
| `presets/lint/tsconfig.json` and `presets/rules/tsconfig.json` extend the root config, so type-aware lint sees the Node.js types and the `.ts` import extensions. | `pnpm run check`                                                                                                     |
| Only `adamantite rule test` runs a saved test, and no temporary verification case stays in the target project.                                                    | Nothing. The hardening skill asks it of the agent.                                                                   |
| Two files for one rule name, such as `no-foo.js` and `no-foo.ts`, fail the lint run.                                                                              | `presets/__tests__/custom.test.ts`                                                                                   |
| A rule that throws in a visitor fails the lint run with a plugin error, as the custom rules reference of the hardening skill tells agents.                        | `presets/__tests__/custom.test.ts`                                                                                   |
| Two installed copies of Adamantite that load one rules folder write two entry modules.                                                                            | `presets/__tests__/custom.test.ts`                                                                                   |
| The fallback folder of the entry modules is one that only the current user can write.                                                                             | `presets/__tests__/custom.test.ts`, except on Windows, which gives each user a temporary directory                   |
| A `--debug=files` run writes no entry module in the project.                                                                                                      | Nothing                                                                                                              |
