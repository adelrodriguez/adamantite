---
name: adamantite-hardening
description: Use after fixing a regression or a mistake that a review corrected before, before adding a lint disable comment, when hardening coding standards with Adamantite, when configuring layer maps or import owners, or when writing and testing custom rules.
metadata:
  type: core
  library: adamantite
  library_version: "0.45.0"
sources:
  - "adelrodriguez/adamantite:src/commands/harden.ts"
  - "adelrodriguez/adamantite:src/commands/rule.ts"
  - "adelrodriguez/adamantite:src/lib/hardening/**/*"
  - "adelrodriguez/adamantite:src/lib/project/custom-rules/*"
  - "adelrodriguez/adamantite:presets/rules/*.ts"
  - "adelrodriguez/adamantite:presets/lint/plugins/adamantite/rules/layers.ts"
  - "adelrodriguez/adamantite:presets/lint/plugins/adamantite/rules/import-owners.ts"
---

# Adamantite hardening

Use this skill to keep, place, and enforce the coding standards of a target project, the project
that Adamantite configures or checks. For setup, checks, Doctor findings, and updates, use the
`adamantite` skill.

## Select the task

Read the target project's instructions and package scripts. Run commands from its root
with its package manager and installed Adamantite version. Use `adamantite <command> --help`
to check options that the task needs.

Use the section below that matches the request. Read a linked guide only when that case
applies. Continue when you have identified the target project, and the mistake or the standard
that the task is about.

## Keep a fixed mistake from recurring

After you fix a regression, a mistake that a reviewer corrected before, or a break of a project
standard that no check reported, and before you add a disable comment, follow
[How to keep a fixed mistake from recurring](references/corrections.md). It starts from that one
mistake, checks whether a tool already reports it, and decides whether the project keeps a test,
a type, a rule, an instruction, or nothing.

The task is complete when the guide's checks pass.

## Harden coding standards

Run `adamantite harden` and follow its Markdown prompt. The prompt puts each coding standard on a
step of [the enforcement ladder](references/enforcement-ladder.md). `adamantite harden --json` prints what the
prompt is built from, such as the agent reach and the suppressions, as JSON. Use `--path` to limit the scope
when the request covers one package or folder. Show the candidate standards and wait for
the user's approval before writing. If no human can approve, report the candidates and stop.

The prompt shows the decisions of the decisions record, `.adamantite/decisions.jsonl`. Do not
propose again what a decision settles. After the user answers, append the session line that the
prompt gives, and one decision line for each candidate that the user did not approve and for each
decision that the user resolved. Copy the lines that the prompt gives, and never edit or delete an
earlier line.

For rule trials that the prompt requests, follow
[How to try a rule setting](references/rule-trials.md).
For approved custom rules, follow [How to write and verify custom rules](references/custom-rules.md).

A non-interactive `harden` run only prints the prompt. Its exit code does not verify the
work. Hardening is complete when the approved standards are enforced, the checks pass,
and Doctor reports no findings.

## Custom rules

To add, change, verify, or save tests for a project-owned rule, follow
[How to write and verify custom rules](references/custom-rules.md).

The task is complete when the guide's verification and cleanup checks pass.

## Import rules

To state which folders or files may import another, follow
[How to configure layer maps and import owners](references/import-rules.md).

The task is complete when the guide's checks pass.

## Report the result

If a required tool or source was unavailable, name it on the first line and state what you
used instead. Report the standard, its evidence, the step of the enforcement ladder, the
changes, the commands run, and their results. For a custom rule, include the cases tested and
whether you removed temporary verification files.

The report is complete when every result has command output or an inspected artifact as evidence.

## Check the result

- The task started from one mistake, one standard, or the harden prompt, and stayed in that scope.
- Every new standard has the user's approval, or the report shows the proposal and says that no
  human could approve it.
- `adamantite check` and the tests of each changed behavior passed, or the report names what
  remains unverified.
- Every new or changed custom rule passed verification, and temporary cases are removed.
