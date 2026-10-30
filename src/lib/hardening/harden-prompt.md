# Adamantite harden

This project uses Adamantite {{version}} to manage linting, formatting, and type tooling.
`adamantite harden` asks you to find the coding standards that this project already follows, and to put each one on the highest step of the enforcement ladder that works.

Steps 1 to 6 are read-only. You change files only in step 7, and only for the candidates that the user approves.

## Context

{{scope}}

### Oxlint config

{{configs}}

### Rules folders

{{rulesFolders}}

### Instructions

{{instructionFiles}}

### Documentation

These are the Markdown files of the project, without the changesets and the changelogs.

{{documentationFiles}}

## 1. Explore the documentation

Start with each `AGENTS.md` above. Coding agents start from `AGENTS.md`, so it is the only instruction file that they surely read. It must point to the other documentation of the project. Then read each file in the documentation list above. Also read the files that the instructions link to or tell agents to read, also when the list does not have them, and the comments in the Oxlint config. A linked file outside the scope of `--path` counts: read it, but do not survey the code beside it.

Mark each file as "has standards" or "no standards". A file that states a standard, but that no chain of links from an `AGENTS.md` reaches, is a **discovery gap**: an agent that starts from `AGENTS.md` never finds its standards. Record the file, its standards, and the `AGENTS.md` that should point to it.

This step is done when each file in the documentation list, and each file that the instructions link to, has its mark.

## 2. List the written standards

List each standard that a file marked "has standards" states, with its file and line. Each written standard is a candidate, and goes on to step 4, also when the code breaks it in many places.

## 3. Survey the code

Survey these areas: file names and placement, import direction, naming, API use, error handling, and test layout. In each area, find the patterns that the code follows and that no instruction states.

- A pattern is a candidate when the code follows it in several places and has few counterexamples. List each counterexample with its file and line.
- Give the scope of each count as globs, and the command that gives the count, such as an `rg` command. Count source, tests, and generated code apart.
- If the GitHub CLI `gh` is available and authenticated, read the review comments of recent merged pull requests. A correction that reviewers repeat is a strong sign of a standard.
- A construct that the code never uses is not a standard by itself. It needs an instruction, a review comment, or a commit that states it.
- Read the git history of the Oxlint config, for example with `git log -p -- oxlint.config.ts`. A rule that a commit removed is a **decision** that the maintainer already made, not a candidate.

This step is done when each area has its candidates or the note "none found".

## 4. Drop what a tool already enforces

For each written standard from step 2 and each candidate from step 3, find out whether a tool already enforces it. Read the Oxlint config, the presets and plugins that it extends, its overrides, the custom rules, `tsconfig.json`, and the checks that the project runs in CI.

- When you are not sure, lint a counterexample from step 3 where it is, and read whether the lint reports it.
- To try a rule that is not on, or a rule with options, make a **trial copy** outside the project: copy the files that git does not ignore, as they are now, with their uncommitted changes: `git ls-files -z --cached --others --exclude-standard | rsync -a --from0 --files-from=- --ignore-missing-args ./ <folder>`. Then link each `node_modules` folder of the project into the same place in the copy. In the copy, change the Oxlint config that lints the candidate's files: the root config, or the config of the workspace package when the package has its own. Add one file with the case that the rule must report and one file with the case that it must accept, and run Oxlint from the folder of that config. The project itself stays unchanged.
- A trial is valid only when the rule reports the first file at the severity that you set, and accepts the second. Oxlint accepts a rule name that does not exist, so a run without a report is not evidence. A report from a rule that only the trial turns on is not enforcement: the rule is a proposal for step 5.
- When no counterexample exists, mark the enforcement as not confirmed.
- Drop each candidate that a tool enforces fully. When a tool enforces only part of a written standard, keep the other part as a candidate.

This step is done when each written standard and each candidate is marked as enforced, partly enforced, not enforced, or not confirmed, with the rule or the lint output as evidence.

## 5. Place each candidate on the enforcement ladder

Put each remaining candidate on the highest step that works:

1. **Type or structure:** a type, a schema, a module boundary, or a stricter TypeScript option makes the mistake impossible.
2. **Preset rule:** a rule in an Oxlint preset or plugin that the project can turn on, or an option of a rule that is already on. A native rule, such as a file-name rule, comes before a custom rule that checks the same thing.
3. **Import rule:** `adamantite/layers` for one-way imports between the folders of a root, `adamantite/import-owners` for a package that only one file or folder imports, or `no-restricted-imports` with an override for the files that the standard applies to. In Oxlint, a later override replaces the options of a rule that an earlier override set for the same files. Write one combined `no-restricted-imports` for each set of files, with the paths of the existing overrides.
4. **Project check:** a check that the project already runs, such as Turbo boundaries, Knip, or a script that reads `package.json`.
5. **Custom rule:** a rule in the rules folder that checks the AST.
6. **Instruction:** a line in `CODING_STANDARDS.md`, only when no tool can check the standard.

For each rule, give one case that the rule must report and one similar case that it must accept. Say what the rule guarantees and what it does not, such as "bans named exports, but does not require a default export". When the rule checks only part of the standard, say which part stays an instruction.

A candidate that needs a choice from the maintainer before a rule is useful is a decision, not a candidate. Examples are two documents that state a policy differently, and a migration that changes how the code behaves. Put it in the Decisions list of step 6, and propose no rule for it.

## 6. Show the candidates and wait for approval

Score each candidate from 1 to 5:

- **5:** a real standard, with correct counts, that no tool enforces, on the right step, with a precise rule. The maintainer can approve it as it is.
- **4:** real and useful, with one small problem, such as a count that is not exact.
- **3:** real but of low value.
- **2:** mostly enforced already, wrong evidence, or many false positives.
- **1:** not a standard.

Show the candidates with a score of 4 or 5, from the highest score to the lowest. Show each one with:

- the standard in one sentence
- its source: the instruction file and line, or the code only
- the number of places that follow it, its scope, and the counterexamples
- its step on the ladder, and the rule, option, or instruction that you propose
- the case that the rule must report, and the case that it must accept
- the part of the standard that stays an instruction, if a part stays
- the existing code that the new rule would report

Then show three short lists:

- **Decisions:** each written standard that the code does not follow, each rule that a commit removed, and each choice from step 5. Give the instruction, the code, and the choice that the maintainer must make.
- **Discovery gaps:** the gaps from step 1. Propose a pointer only for the standards that stay instructions, because a rule replaces the instruction that a pointer would lead to.
- **Also considered:** the candidates with a score of 3 or lower, one line for each, with the reason.

Ask the user which candidates to write. This step is done when the user names the candidates to write, or approves none.

When no human can approve, for example in CI or in an unattended session, the candidates are the result of the run. Stop after this step.

## 7. Write the approved standards

Write only the approved candidates:

- **Type, structure, preset rule, import rule, or project check:** change the types, the Oxlint config, `tsconfig.json`, or the check.
- **Custom rule:** run `adamantite rule add <name>`, and follow the "Custom rules" section of the Adamantite skill. When the rules folder above is not `.adamantite/rules`, pass it with `--dir`, such as `adamantite rule add <name> --dir tooling/rules`.
  - The rule message says what to do instead.
  - A comment at the top of the rule file states the standard and why it exists.
  - The test has the case that the rule must report and the case that it must accept.
- **Instruction that became a rule:** delete the instruction of each standard that a rule now checks. The rule is the only source of the standard. When the rule checks only part of the standard, keep the other part as the instruction.
- **Existing violations:** keep the code that a new rule reports as it is, and list the violations for the user. Keep the rule at `error`, and add an `overrides` entry to the Oxlint config that turns the rule off only in the files that break it now, such as `{ files: ["src/legacy/cart.ts"], rules: { "project/no-foo": "off" } }`. Do not set the rule to `warn`: `adamantite check` fails on warnings. New files must follow the rule. A separate change fixes the violations and removes each file from the override.
- **Instruction:** write each approved standard that no tool can check to `CODING_STANDARDS.md`, one line for each standard. When no `AGENTS.md` points to `CODING_STANDARDS.md`, add the pointer to the root `AGENTS.md`.
- **Discovery gap:** add each approved pointer to the instruction file that the gap names.

## Verify

When you wrote files, run `adamantite check`, `adamantite rule test`, and `adamantite doctor` in this order — through your package runner, such as `npx` or `pnpm exec`, if they are not on PATH.
All three must exit 0. When you changed a project check, also run that check with the project's own command, from the folder where CI runs it, and it must exit 0 too. When a new rule makes `check` fail, fix the rule or add the file to the override as step 7 says, not a disable comment. When `rule test` fails, fix the rule. Change a test case only when the case itself is wrong, and tell the user which case you changed and why.
