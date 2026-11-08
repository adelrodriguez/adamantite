---
name: adamantite
description: Use when setting up Adamantite, running its checks, repairing Doctor findings, updating managed dependencies, hardening coding standards, or writing and testing custom rules.
metadata:
  type: core
  library: adamantite
  library_version: "0.45.0"
sources:
  - "adelrodriguez/adamantite:src/cli.ts"
  - "adelrodriguez/adamantite:src/commands/**/*.ts"
  - "adelrodriguez/adamantite:src/lib/execution/skill.ts"
  - "adelrodriguez/adamantite:src/lib/toolchain/index.ts"
  - "adelrodriguez/adamantite:src/lib/integrations/tooling/oxlint/plugins/**/*.ts"
  - "adelrodriguez/adamantite:src/lib/integrations/tooling/knip/config.ts"
  - "adelrodriguez/adamantite:src/lib/workspace/custom-rules/*"
  - "adelrodriguez/adamantite:presets/lint/*.ts"
  - "adelrodriguez/adamantite:presets/rules/*.ts"
---

# Adamantite

Use Adamantite to maintain the code-quality tools of a target project, the project that
Adamantite configures or checks.

## Select the task

Read the target project's instructions and package scripts. Run commands from its root
with its package manager and installed Adamantite version. Use `adamantite <command> --help`
to check options that the task needs.

Use the section below that matches the request. Read a linked guide only when that case
applies. Continue when you have identified the target project, command, and requested scope.

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

The task is complete when the affected checks exit 0 and you have read their output.

## Repair managed setup

Run `adamantite doctor`. It assesses managed integrations without changing files.
Without a terminal, it prints a Markdown repair prompt and exits 1 when findings remain.
Follow each finding's current state, goal, reference, and verification command.
For old layer-map declarations, use the migration step in
[Configure layer maps and import owners](references/lint-rules.md#configure-layer-maps-and-import-owners).
For a finding about the previous custom-rules API, use the migration step in
[How to write and verify custom rules](references/custom-rules.md#repair-an-existing-rules-folder).

Run Doctor again after the repair. This step is complete when Doctor exits 0 with no
findings. Report assessment warnings separately, because warnings alone also exit 0.

## Update managed dependencies

Run `adamantite update`. It updates managed dependencies and refreshes stale skill copies
that `init` installed from the package. It reports remaining setup findings but can exit 0
with findings still present.

Follow the repair step above. The update is complete when Doctor reports no findings and
the project's checks pass.

## Harden coding standards

Run `adamantite harden` and follow its Markdown prompt. Use `--path` to limit the scope
when the request covers one package or folder. Show the candidate standards and wait for
the user's approval before writing. If no human can approve, report the candidates and stop.

For rule trials that the prompt requests, follow the trial step in
[How to repair preset rule reports](references/lint-rules.md#try-a-rule-setting).
For approved custom rules, follow [How to write and verify custom rules](references/custom-rules.md).

A non-interactive `harden` run only prints the prompt. Its exit code does not verify the
work. Hardening is complete when the approved standards are enforced, the checks pass,
and Doctor reports no findings.

## Custom rules

To add, change, verify, or save tests for a project-owned rule, follow
[How to write and verify custom rules](references/custom-rules.md).

The task is complete when the guide's verification and cleanup checks pass.

## Report the result

If a required tool or source was unavailable, name it on the first line and state what you
used instead. Report the changes, commands run, results, and remaining findings or warnings.
For a custom rule, include the cases tested and whether you removed temporary verification files.

The report is complete when every result has command output or an inspected artifact as evidence.

## Check the result

- The selected command matches the requested task and scope.
- The affected checks passed, or the report names the checks that remain unverified.
- Doctor findings and assessment warnings are reported separately.
- Every new or changed custom rule passed verification, and temporary cases are removed.
