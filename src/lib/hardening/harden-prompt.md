# Adamantite harden

This project uses Adamantite {{version}} to manage linting, formatting, and type tooling.
`adamantite harden` asks you to find the coding standards that this project already follows, and to put each one on the highest step of the enforcement ladder that works.

Steps 1 to 5 are read-only. You change files only in step 6, and only for the candidates that the user approves.

## Context

Adamantite found these files at the project root.

### Oxlint config

{{configs}}

### Rules folders

{{rulesFolders}}

### Instructions

{{instructionFiles}}

## 1. List the written standards

Read each instruction file above. List each standard that it states, with its file and line.

## 2. Survey the code

Survey these areas: file names and placement, import direction, naming, API use, error handling, and test layout. In each area, find the patterns that the code follows and that no instruction states.

- A pattern is a candidate when the code follows it in several places and has few counterexamples. List each counterexample with its file and line.
- If the GitHub CLI `gh` is available and authenticated, read the review comments of recent merged pull requests. A correction that reviewers repeat is a strong sign of a standard.

This step is done when each area has its candidates or the note "none found".

## 3. Drop what a tool already enforces

For each candidate, find out whether a tool already enforces it. Read the Oxlint config, the presets and plugins that it extends, its overrides, the custom rules, and `tsconfig.json`.

- When you are not sure, lint a counterexample from step 2 where it is, and read whether the lint reports it. When no counterexample exists, mark the enforcement as not confirmed.
- Drop each candidate that a tool enforces.

## 4. Place each candidate on the enforcement ladder

Put each remaining candidate on the highest step that works:

1. **Type or structure:** a type, a schema, a module boundary, or a stricter TypeScript option makes the mistake impossible.
2. **Preset rule:** a rule in an Oxlint preset or plugin that the project can turn on, or an option of a rule that is already on.
3. **Import rule:** `no-restricted-imports`, with an override for the files that the standard applies to.
4. **Custom rule:** a rule in the rules folder that checks the AST.
5. **Instruction:** a line in `CODING_STANDARDS.md`, only when no tool can check the standard.

## 5. Show the candidates and wait for approval

Show each candidate to the user with:

- the standard in one sentence
- its source: the instruction file and line, or the code only
- the number of places that follow it, and the counterexamples
- its step on the ladder, and the rule, option, or instruction that you propose
- the existing code that the new rule would report

Ask the user which candidates to write. This step is done when the user names the candidates to write, or approves none.

When no human can approve, for example in CI or in an unattended session, the candidates are the result of the run. Stop after this step.

## 6. Write the approved standards

Write only the approved candidates:

- **Type, structure, preset rule, or import rule:** change the types, the Oxlint config, or `tsconfig.json`.
- **Custom rule:** run `adamantite rule add <name>`, and follow the "Custom rules" section of the Adamantite skill. When the rules folder above is not `.adamantite/rules`, pass it with `--dir`, such as `adamantite rule add <name> --dir tooling/rules`.
  - The rule message says what to do instead.
  - A comment at the top of the rule file states the standard and why it exists.
- **Instruction that became a rule:** delete the instruction of each standard that a rule now checks. The rule is the only source of the standard.
- **Existing violations:** keep the code that a new rule reports as it is, and list the violations for the user. Set the rule to `warn`: for a custom rule, use the `rules` option of `custom()`, such as `custom({ rules: { "no-foo": "warn" } })`; for a preset rule or an import rule, set it in the Oxlint config or override that turns it on. A separate change fixes the violations and sets the rule back to `error`.
- **Instruction:** write each approved standard that no tool can check to `CODING_STANDARDS.md`, one line for each standard.

## Verify

When you wrote files, run `adamantite check` and `adamantite doctor` — through your package runner, such as `npx` or `pnpm exec`, if they are not on PATH.
Both must exit 0. When a new rule makes `check` fail, fix the rule or set it to `warn` as step 6 says, not a disable comment.
