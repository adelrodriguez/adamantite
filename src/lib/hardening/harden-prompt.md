# Adamantite harden

This project uses Adamantite {{version}} to manage linting, formatting, and type tooling.
`adamantite harden` asks you to find the coding standards that this project already follows, and to put each one at the highest level of enforcement that works: a custom rule when a rule can check it, and an instruction when no rule can.

{{context}}

## 1. List the written standards

Read the instruction files above. List each standard that they state, with its file and line.

## 2. Survey the code

Find the patterns that the code follows but that no instruction states: file names and placement, import direction, naming, API use, error handling, and test layout.

- A pattern is a standard only when the code follows it in several places and has few counterexamples. List each counterexample with its file and line.
- If the GitHub CLI `gh` is available and authenticated, read the review comments of recent merged pull requests. A correction that reviewers repeat is a strong sign of a standard.
- Do not propose a standard for a pattern that occurs one time. A rule earns its place when it stops a mistake that recurs.

## 3. Drop what a tool already enforces

For each candidate, find out whether a tool already enforces it. Read the Oxlint config, the presets and plugins that it extends, its overrides, and the custom rules. Read `tsconfig.json` for the type-level standards.

- When you are not sure, lint a counterexample from step 2 and read whether the lint reports it. Do not write a sample file: this step must not change the project. If no counterexample exists, say that the enforcement is not confirmed.
- Drop each candidate that a tool already enforces.

## 4. Place each candidate on the enforcement ladder

Put each remaining candidate at the highest step that works:

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

Ask the user which candidates to write. **Do not change any file before the user approves.**

**If no human can approve, for example in CI or in an unattended session, stop here.** The candidates are the result of the run.

## 6. Write the approved standards

Write only the candidates that the user approved:

- **Type, structure, preset rule, or import rule:** change the types, the Oxlint config, or `tsconfig.json`.
- **Custom rule:** run `adamantite rule add <name>` to write the rule in the rules folder, and follow the `AGENTS.md` in that folder. When the rules folder above is not `.adamantite/rules`, pass it with `--dir`, such as `adamantite rule add <name> --dir tooling/rules`. Run `adamantite rule ast <file>` to find the node names. Test the rule with `RuleTester` from `oxlint/plugins-dev`.
  - The rule message says what to do instead.
  - A comment at the top of the rule file states the standard and why it exists.
- **Instruction that became a rule:** delete the instruction of each written standard that a rule now checks. The rule is the only source of the standard.
- **Existing violations:** when a new rule reports existing code, do not fix that code. List the violations for the user, and set the rule to `warn`. For a custom rule, use the `rules` option of `custom()`, such as `custom({ rules: { "no-foo": "warn" } })`. For a preset rule or an import rule, set it to `warn` in the Oxlint config or override that turns it on. A separate change fixes the violations and sets the rule back to `error`.
- **Instruction:** write each approved standard that no tool can check to `CODING_STANDARDS.md`, one line for each standard.

## Verify

When you wrote files, run `adamantite check` and `adamantite doctor` — through your package runner, such as `npx` or `pnpm exec`, if they are not on PATH.
Both must exit 0. Do not suppress or work around a rule; fix the rule or set it to `warn` as step 6 says.
