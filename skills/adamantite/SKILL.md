---
name: adamantite
description: Use when setting up Adamantite, running its checks, repairing preset rule reports or Doctor findings, or updating managed dependencies.
metadata:
  type: core
  library: adamantite
  library_version: "0.45.0"
sources:
  - "adelrodriguez/adamantite:src/cli.ts"
  - "adelrodriguez/adamantite:src/commands/**/*.ts"
  - "adelrodriguez/adamantite:src/lib/integrations/agents/skill.ts"
  - "adelrodriguez/adamantite:src/lib/bridge/index.ts"
  - "adelrodriguez/adamantite:src/lib/integrations/oxlint/plugins/**/*.ts"
  - "adelrodriguez/adamantite:src/lib/integrations/knip/config.ts"
  - "adelrodriguez/adamantite:presets/lint/*.ts"
---

# Adamantite

Use Adamantite to maintain the code-quality tools of a target project, the project that
Adamantite configures or checks.

## Select the task

Read the target project's instructions and package scripts. Run commands from its root
with its package manager and installed Adamantite version. Use `adamantite <command> --help`
to check options that the task needs.

Use the section below that matches the request. Read a linked guide only when that case
applies. For a coding standard, a custom rule, a fixed mistake, a disable comment, or
`adamantite harden`, use the `adamantite-hardening` skill.

Continue when you have identified the target project, command, and requested scope.

## Set up a target project

For a new installation, follow [How to set up Adamantite](references/setup.md).
Use Doctor for drift in an existing installation. A code-quality failure belongs in the
checks below, rather than another initialization.

Setup is complete when the selected scripts run and Doctor reports no findings.

## Check and fix code

Use the project's managed scripts when they exist. Otherwise, run the CLI through the
project's package manager:

- Run `adamantite check` for read-only formatting, lint, and type checks. Fix warnings
  instead of adding `--allow-warnings` to pass the check.
- Run `adamantite fix` for safe lint fixes and formatting. Review the effect and get explicit
  permission before using `--suggested`, `--dangerous`, or `--all`.
- Run `adamantite analyze` for unused files, exports, and dependencies. In a monorepo it
  runs Sherif before Knip. Inspect the findings before using `--fix`, which can remove files.

To repair preset rule reports or change their configuration, follow
[How to repair preset rule reports](references/lint-rules.md).

Pass underlying tool arguments after `--`. For `check` and `fix`, they go to Oxlint unless
`--only` selects another stage. For `analyze`, they go to Knip unless `--only` selects
Sherif. For example, use `adamantite analyze --only monorepo -- --select highest`.
When a package manager consumes a separator, add another, as in
`npm run analyze -- -- --directory packages/app`.

If Sherif needs a version choice without a terminal, set `sherif.select` to `"highest"`
in the root `package.json`, or pass `--select highest` to the monorepo stage.
Keep permanent Sherif settings in that `sherif` object, with camelCase option names.
Sherif refuses fixes when `CI` is set. Use `analyze --only unused --fix` to run only Knip fixes there.

When `adamantite check` stops with Oxlint's `Cannot find native binding` error, read its `cause`
chain, which lists each binding file and package that Oxlint tried. When it stops with
`tsrs: Cannot find the optional dependency`, the message names the missing `@tsrs/*` package. Both
mean that the install left out the optional dependency for this platform. Reinstall the
dependencies with optional dependencies for this platform, then run the check again.

`adamantite check` proves formatting, lint rules, and types. It does not run the project's tests.
After you change behavior, find the project's test command in its instructions or its package
scripts, and run the tests of the changed code.

The task is complete when the affected checks exit 0, the tests of each changed behavior pass,
and you have read their output.

## Repair managed setup

Run `adamantite doctor --json`. It assesses the integrations of the setup without changing files,
prints the assessment as one JSON document, and exits 1 when findings remain. Each finding has its `id`,
`currentState`, `goal`, and the optional `reference` and `notes`. Without `--json` and a terminal,
Doctor prints the same findings as a Markdown repair prompt.
Follow each finding's current state, goal, reference, and verification command.
For the `oxlint-config-load-failure` finding, read the error that Oxlint printed. When it says
`Cannot find native binding`, reinstall the dependencies as "Check and fix code" says, and keep the
config unchanged. Otherwise, repair the config or the rule file that the error names. When it
imports an Adamantite preset or a name that the installed package does not export, use the
replacement that the [changelog](https://github.com/adelrodriguez/adamantite/blob/main/CHANGELOG.md) names for it. For
a custom rule or a rules folder, use the repair step in
[How to repair preset rule reports](references/lint-rules.md#repair-an-existing-rules-folder).
When Doctor warns that a config states import layers by hand, use the `adamantite-hardening`
skill to state them in layer maps.

Run `adamantite doctor --json` again after the repair. This step is complete when Doctor exits 0
with no findings. Report the `warnings` separately, because warnings alone also exit 0.

## Update managed dependencies

Run `adamantite update --json`. It installs the managed packages of the recorded setup, writes the
managed files of the recorded setup, such as `.vscode/extensions.json` and the Adamantite skills, that are
missing or unchanged since Adamantite wrote them, and writes
`.adamantite/adamantite-lock.json`. In a project without a lockfile, it sets up nothing and reports
one finding: run `adamantite init`. Commit the lockfile. The JSON lists the file writes, the script writes, and the installs in `setup`, and the
findings that remain in `assessment`. It exits 1 while findings remain.

Follow the repair step above. The update is complete when Doctor reports no findings and
the project's checks pass.

## Report the result

If a required tool or source was unavailable, name it on the first line and state what you
used instead. Report the changes, commands run, results, and remaining findings or warnings.

The report is complete when every result has command output or an inspected artifact as evidence.

## Check the result

- The selected command matches the requested task and scope.
- The affected checks and the tests of each changed behavior passed, or the report names what
  remains unverified.
- Doctor findings and assessment warnings are reported separately.
