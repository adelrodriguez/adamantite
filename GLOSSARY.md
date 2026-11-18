# Adamantite

Adamantite is an agent-first preset package and CLI for modern TypeScript codebases. It
applies and maintains code-quality tooling in a target project, and gives coding agents the
instructions to set up, repair, and update that project.

## Language

**Preset**:
Published configuration that a target project consumes for linting, formatting, analysis,
or TypeScript.
_Avoid_: Plugin, template

**Stack**:
A set of presets that a target project selects together with core, such as `effect`, `vitest`,
and `strict`. The preset tests lint the rule fixtures with each stack, so a rule of one
preset cannot report code that another preset of the stack accepts.
_Avoid_: Combination, preset group

**Fixture packages**:
The npm packages that the preset test fixtures import, such as React and TanStack Query, so a
type-aware run gets their real types. They have their own manifest and lockfile in
`presets/__tests__/fixture-packages/`, apart from the packages of the repository.
_Avoid_: Target project, test project, sandbox

**Type reset**:
A first-party declaration that `adamantite/typescript` loads to replace the type of a built-in API,
such as `JSON.parse()` returning `unknown`.
_Avoid_: Vendored bundle, patch, override

**First-party plugin**:
Adamantite's own Oxlint plugin, under the `adamantite/*` rule namespace. It ships inside the
package, and presets load it by file URL, so target projects install nothing extra. A rule
in it is a first-party rule. The `quality` and `quality-effect` plugins are first-party
plugins too.
_Avoid_: Vendored bundle, managed plugin, custom plugin

**Managed plugin**:
A third-party Oxlint plugin that stays an npm package in the target project. Adamantite
pins its version, installs it when its preset is selected, and keeps it in sync through
doctor and update.
_Avoid_: Vendored bundle, dependency

**Layer map**:
A dependency graph for the immediate child folders of one root. Each containing layer map
checks the files below its root independently.
_Avoid_: Layer order, boundaries

**Layer**:
A folder in a layer map, with the sibling layers that it can import directly or transitively.
A layer can contain its own layer map.
_Avoid_: Level, tier

**Entry**:
A composition file below the root of a layer map, such as `router.tsx`. An entry imports any
layer, and no layer imports an entry.
_Avoid_: Composition layer, entrypoint

**Import owner**:
A file or folder that the first-party rule `adamantite/import-owners` lets import a package, or
some exports of it. Every other file uses what the owner exports.
_Avoid_: Allowed importer, import boundary

**Custom rule**:
An Oxlint rule that the target project keeps in a rules folder to enforce a coding standard.
Agents verify it with temporary valid and invalid cases, then discard those cases. Users can
choose to keep saved tests and run them explicitly with `adamantite rule test`. Adamantite
owns the wiring and the authoring guidance. Use "plugin" only for the Oxlint `jsPlugins` entry
that loads the rules.
_Avoid_: Custom plugin, project plugin, first-party rule

**Rules folder**:
The folder that `custom()` loads custom rules from, `.adamantite/lint` by default. Each
file in it is one custom rule, except files that start with `_`, declaration files, and
optional `.test.*` files. An optional test sits beside its rule unless the user gives another path.
_Avoid_: Plugin folder

**Target project**:
The project that Adamantite configures or checks.
_Avoid_: Adamantite repository, consumer repository

**Integration**:
Everything Adamantite knows about one tool, editor, CI provider, or the agent guidance: whether the
selection includes it, its packages, its managed files, and its assessment. Each integration in the
list of `src/lib/integrations/index.ts` owns a folder there, such as `vscode/`.
_Avoid_: Managed integration, adapter, plugin, preset

**Tooling integration**:
An integration for a package and its configuration, such as Oxlint, Oxfmt, Knip, Sherif, or tsrs.
_Avoid_: Dependency adapter

**Latest supported state**:
The state that the running Adamantite version gives an integration for a selection: its packages at
the managed versions, and its managed files as this version renders them. A kept file reaches it
when Doctor reports no finding for it.
_Avoid_: Managed ideal, managed state, supported state

**Bridge**:
The layer between the commands and the integrations, in `src/lib/bridge`. `check`, `fix`, and
`analyze` call it with the user's options. The lockfile selection decides which tools it runs, such
as Oxfmt, Oxlint, Sherif, and Knip. The bridge runs them in order and decides when the command
fails. Plugins extend an integration, such as the Effect build of Oxlint, so the bridge calls them
through that integration. `@effect/tsgo/oxlint-bridge` is an Effect module that the Oxlint entry
loads, not the bridge.
_Avoid_: Toolchain, proxy

**Oxlint runtime**:
The Oxlint package, native binding, and type-aware backend that Adamantite runs Oxlint with for
one target project. Each native part is the installed one, or a replacement that a managed
plugin ships, such as the Effect build from `@effect/tsgo`.
_Avoid_: Toolchain, patch, setup

**Plugin language**:
A language that Oxfmt formats only through a bundled Prettier plugin, which imports a package from
the target project, such as Astro and Svelte. The format preset turns each one on, and Doctor
reports a project that does not install a version of the package that Oxfmt supports.
_Avoid_: Framework language, plugin format

**Managed script**:
A `package.json` script whose command is owned by Adamantite, such as `check`. Setup sets each
selected one to its command and replaces what it ran, the one exception to whole files. Doctor
reports a selected one that is missing or runs another command.
_Avoid_: User script, package command

**Selection**:
What `init` was asked to set up in a target project: the lint presets, the TypeScript preset, the
editors, the CI provider, the agent guidance, and the managed scripts. The lockfile records it, and
Doctor checks each integration that it includes.
_Avoid_: Options, config, setup flags

**Lockfile**:
`.adamantite/adamantite-lock.json` at the root of a target project, or at the workspace root of a
monorepo. It records the selection, the Adamantite version that last wrote it, and the hash of each
file that Adamantite wrote whole. Only `init` and `update` write it, and the project commits it.
_Avoid_: Manifest, state file, `skills-lock.json`

**Managed file**:
A file that Adamantite renders whole for a selection, such as `.vscode/extensions.json`. `init` and
`update` write it under the write rule, and the lockfile records the hash of what they wrote.
_Avoid_: Generated file, template

**Write rule**:
Adamantite writes a managed file only whole, and only when the file does not exist or its hash
equals the hash in the lockfile. A file that the user changed is kept, and Doctor reports a change
that breaks the setup. A file that the selection no longer renders is deleted while its hash
matches. Adamantite never merges, splices, or edits a config. A managed script is the one exception.
_Avoid_: Merge, overwrite policy

**Assessment**:
The read-only check of a target project against the latest supported state of each integration
that its selection includes. It gives the findings, the warnings, and the package actions. Doctor
prints it, and `init` and `update` assess the project that the setup left.
_Avoid_: Check result, diagnostic

**Finding**:
A detected difference between the current state and the latest supported state. It states
the current state, the goal criteria, and repair constraints.
_Avoid_: Action, diagnostic, manual fix

**Handoff**:
Give the terminal to an installed coding agent CLI, seeded with a Markdown prompt. Adamantite
waits until the agent session ends, then reads the project again to verify the work. A command
hands off only through `Resolution.offer`, and never with `--json`.
_Avoid_: Delegation, agent launch

**Adamantite skill**:
The agent skill that the Adamantite package ships in `skills/adamantite/`. It teaches coding
agents how to use Adamantite and how to write custom rules. The CLI bundles it. `init` writes it
to the skill folders of the agents that the project uses as managed files, and `update` writes the
skill of a new version over each copy that nobody changed.
_Avoid_: Plugin, agent guidance

**Resolution menu**:
The terminal menu that offers a handoff to each installed coding agent, a copy of the Markdown
prompt, or nothing. `doctor`, `harden`, `init`, and `update` show it in an interactive terminal,
through `Resolution.offer`. Without one, they print the Markdown prompt, and with `--json` they
print a JSON document instead.
_Avoid_: Handoff menu

## Integration lifecycle

**Setup**:
What `Setup.apply` does for a selection, the one backend of `init` and `update`: one install of the
managed packages, the managed scripts, the managed files under the write rule, and the lockfile
last. `init` takes the selection from its prompts or flags, and `update` from the lockfile.
_Avoid_: Create, migrate, repair

**Assess**:
What an integration's `assess` does: read the target project, and report its package drift and each
change that breaks the setup as findings, without changing the project.
_Avoid_: Fix, update, detect

**Doctor**:
Assess the target project against the selection in its lockfile, report the findings, and offer
one combined repair prompt through `Resolution.offer`. A project without a lockfile gets one
finding, which says to run `adamantite init`.
_Avoid_: Check, fix, update

## Hardening

**Coding standard**:
A convention that the code of a target project follows, such as where a file goes or which
module may import another. An instruction can state it, or the code can follow it without one.
_Avoid_: Best practice, guideline

**Instructions**:
The written coding standards of a target project, in `CODING_STANDARDS.md`, `AGENTS.md`,
`GLOSSARY.md`, and the ADRs. Agents start from `AGENTS.md`, which points to the others. Agents
read them, but no tool checks them.
_Avoid_: Prose, docs

**Discovery gap**:
A file that states a coding standard, but that no chain of links or code-span paths from an
`AGENTS.md` reaches, so a coding agent that starts from `AGENTS.md` never finds the standard. A link
to a file that does not exist is a discovery gap too.
_Avoid_: Orphan doc, missing pointer

**Standards file**:
`CODING_STANDARDS.md` in the target project. It holds the coding standards that no tool can
check.
_Avoid_: Style guide, conventions doc

**Enforcement ladder**:
The order of the places that can hold a coding standard, from strongest to weakest: a type
or structure, a preset rule, an import rule, a custom rule, and an instruction. A standard goes on
the highest step that can hold it.
_Avoid_: Pyramid, enforcement level

**Trial**:
A lint of cases in a copy of the target project, with one rule at the setting that the trial
gives, or as the config sets it. A case is code that the rule must report or must accept.
`adamantite rule try` runs a trial, and the project stays unchanged. A trial that cannot lint the
cases, such as a trial of a rule that does not exist, is not evidence.
_Avoid_: Dry run, sandbox, trial copy

**Harden**:
Find the coding standards that a target project follows, and move each one up the
enforcement ladder after the user approves it. A coding agent does the work, and Adamantite
renders its prompt. Harden is not an assessment and produces no findings.
_Avoid_: Scan, codify, audit

**Decisions record**:
`.adamantite/decisions.md` at the root of a target project, or at the workspace root of a
monorepo. It holds each candidate that the user did not approve in a harden session, and each
decision that the user resolved, so a later session does not propose them again. The coding agent
writes it, and the project commits it. Adamantite reads only whether it exists and which commit
last changed it, and never its entries.
_Avoid_: ADR, decision log, harden state
