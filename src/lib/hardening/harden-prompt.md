# Adamantite harden

Find the coding standards that this target project already follows. Propose the highest step of the enforcement ladder that can enforce each standard. The project uses Adamantite {{version}}.

Steps 1 to 8 are read-only for the target project. Keep trial case files outside the project and use stdin for RuleTester cases. Change project files only in step 9, for the candidates that the user approves. The one exception is the decisions record, which you append to after the user answers in step 8.

## Context

{{scope}}

### Oxlint config

{{configs}}

### Rules folders

{{rulesFolders}}

### Instructions

{{instructionFiles}}

### Documentation

These are the Markdown files of the project, without the changesets, the changelogs, and the agent skills. A coding agent finds the skills in its skill folder, such as `.agents/skills`, on its own.

{{documentationFiles}}

### Agent reach

{{agentReach}}

### Decisions

The decisions record holds each candidate that the user did not approve, and each decision that the user resolved, in an earlier session. Adamantite decoded the record, so do not read the file.

{{decisionsRecord}}

### Suppressions

{{suppressions}}

### Overrides that turn a rule off

{{overrides}}

## 1. Explore the documentation

Start with each `AGENTS.md` above, then read each file in the documentation list. Follow the files that the instructions link to or tell agents to read, including files absent from the list. Read the comments in the Oxlint config. Read a linked file outside `--path`, but keep the code survey inside the selected scope. Read each file once.

Mark each file as "has standards" or "no standards". A file that states a standard, and that the agent reach above lists as not reached, is a **discovery gap**: an agent that starts from `AGENTS.md` never finds its standards. Record the file, its standards, and the `AGENTS.md` that should point to it. Each link to a Markdown file that does not exist is a discovery gap too. Record the file that the link must go to.

This step is done when each file in the documentation list, and each file that the instructions link to, has its mark.

## 2. List the written standards

List each standard that a file marked "has standards" states, with its file and line. Each written standard is a candidate, and goes on to step 5, also when the code breaks it in many places.

Continue when every written standard has a source location and a candidate entry.

## 3. Survey the code

Survey these areas: file names and placement, import direction, naming, API use, error handling, and test layout. In each area, find the patterns that the code follows and that no instruction states.

- A pattern is a candidate when the code follows it in several places and has few counterexamples. List each counterexample with its file and line.
- Give the scope of each count as globs, and the command that gives the count, such as an `rg` command. Count source, tests, and generated code apart.
- If the GitHub CLI `gh` is available and authenticated, read the review comments of recent merged pull requests. A correction that reviewers repeat is evidence of a standard. If reviews are unavailable, record that limit and use the documentation, code, and local history.
- A construct that the code never uses is not a standard by itself. It needs an instruction, a review comment, or a commit that states it.
- Read the git history of the Oxlint config, for example with `git log -p -- oxlint.config.ts`. A rule that a commit removed is a **decision** that the maintainer already made, not a candidate.

This step is done when each area has its candidates or the note "none found".

## 4. Read the fix history

A mistake that a commit fixed, and that other code repeats, is a standard that a rule can hold.

{{fixHistory}}

- Find the commits that fix a mistake: a bug fix, a revert, or a correction after a review. Read the diff of each one with `git show <commit>`.
- Name the mistake in one sentence, in terms of the code, such as "an `await` in a `forEach` callback" or "a date that the code parses without a time zone". Skip the fixes of logic that only one place has.
- Find the commit that added the mistake, for example with `git log -L` or `git blame <commit>^ -- <file>`. Record it with the fix.
- A mistake is a candidate when two or more fixes have it, or when one fix has it and the code still has the same form in other places. List each fix with its commit, and each other place with its file and line.
- The code before the fix is the case that the rule must report, and the code after the fix is the case that it must accept. Read the code before the fix with `git show <commit>^:<file>`.

If Git or the required history is unavailable, record the missing source and continue with the documentation and code candidates. Do not infer commit evidence.

This step is done when each fix has its mark: "candidate", "one-off", or "not a code mistake", or the missing history is recorded.

## 5. Drop what a tool already enforces

For each written standard from step 2 and each candidate from steps 3 and 4, find out whether a tool already enforces it. Read the Oxlint config, the presets and plugins that it extends, its overrides, the custom rules, `tsconfig.json`, and the checks that the project runs in CI.

- To see whether the config reports a case, or to try a rule that is not on, or a rule with other options, run `adamantite rule try`. It lints the cases in a copy of the project, so the project stays unchanged.
  - `adamantite rule try <rule> --current --report <case>` shows what the config reports now. Use a counterexample from step 3 or 4 as the case.
  - `adamantite rule try <rule> [--options '<json array>'] --report <case> --accept <case>` tries a new rule or new options. The options are the items that come after the severity.

  A case is a project path, such as `src/cart.ts`, or `<path>=<file>` to lint the content of `<file>` at `<path>`, such as `src/cart.ts=/tmp/before.ts`. Write the case files outside the project. Exit 2 means that the trial is not evidence: read its reason.

- A report from a rule that only the trial turns on is not enforcement: the rule is a proposal for step 7.
- When no counterexample exists, mark the enforcement as not confirmed.
- Drop each candidate that a tool enforces fully. When a tool enforces only part of a written standard, keep the other part as a candidate.

This step is done when each written standard and each candidate is marked as enforced, partly enforced, not enforced, or not confirmed, with the rule or the lint output as evidence.

## 6. Find the gaps in the existing rules

Step 5 starts from the standards. This step starts from the rules that the project already has: each custom rule, each `adamantite/layers` map, each `adamantite/import-owners` option, and each `no-restricted-imports` setting and its overrides.

- **Forms that a rule misses:** list the forms of the same mistake that the rule does not report. For an import rule, check `require()`, `import()`, `export … from`, `import type`, and the path aliases of `tsconfig.json`. For a custom rule, read its logic and check the other syntax of the same mistake, such as a call through a variable, optional chaining, a computed member, or a re-export. Search the code for each form, and lint a file that has it. When the code does not have the form yet, run `adamantite rule try <rule> --current --report <control> --report <missed form>`, with a form that the rule reports as the control. The gap is confirmed when it reports the control and does not report the missed form. When no trial can show it, mark the gap as not confirmed: the temporary regression case of step 9 confirms it.
- **Files that a rule misses:** for each `files` glob of an override, list the files that the standard applies to and that the glob does not match, such as a new folder or another file extension.
- **Verification cases:** for each existing custom rule, prepare temporary valid and invalid cases for the forms above. Verify them with RuleTester from stdin. Do not write files in this step. Preserve user-owned saved rule tests.
- **Overrides that can shrink:** each file that the overrides above mark "no longer breaks the rule" or "does not exist" is a candidate: remove it from the override. A file that Oxlint did not lint, because the config ignores it or it does not parse, is not evidence. Check it yourself.
- **Suppressions:** read the counts in the suppressions above. Many suppressions of one rule are a **decision**: the rule is too wide, or the standard has exceptions that the rule must know.

Each gap is a candidate on the step of the rule that it extends: a wider custom rule, a new option, a new test case, a wider glob, or a smaller override. A gap that is not confirmed is a candidate too: show it with the mark "not confirmed". A gap in a rule that a preset or plugin ships, and that no option of the rule can close, is not a candidate: list it under **Decisions** as a report for the maintainers of that package.

This step is done when each rule has its gaps or the note "none found".

## 7. Place each candidate on the enforcement ladder

Before you place a candidate, compare it with the decisions in the Decisions section above, and do the same for each decision from steps 3 and 6, and for each choice that this step finds. One that matches a recorded decision is settled: do not propose it or ask about it again. List it under **Also considered** in step 8, with the `id` of the decision. The exception is evidence that is newer than the date of the decision, such as fix commits after it: then show the candidate or the decision again, with the `id` and the new evidence.

{{ladder}}

For each rule, give one case that the rule must report and one similar case that it must accept. For a type, a project check, or an instruction, give the mistake that it prevents and the similar valid code that it accepts. For a candidate from step 4, use the code before and after one of its fixes. Say what the rule guarantees and what it does not, such as "bans named exports, but does not require a default export". When the rule checks only part of the standard, say which part stays an instruction.

A candidate that needs a choice from the maintainer before a rule is useful is a decision, not a candidate. Examples are two documents that state a policy differently, and a migration that changes how the code behaves. Put it in the Decisions list of step 8, and propose no rule for it.

Continue when every remaining candidate has a proposed step, evidence, limits, and cases, is recorded as a decision, or is settled by a recorded decision.

## 8. Show the candidates and wait for approval

If a tool or source was unavailable, name it on the first line of the report and state the fallback you used. Mark unverified evidence before scoring candidates.

Score each candidate from 1 to 5:

- **5:** a real standard, with correct counts, that no tool enforces, on the right step. Its proposal prevents the mistake and accepts the similar valid case. The maintainer can approve it as it is.
- **4:** real and useful, with one small problem, such as a count that is not exact.
- **3:** real but of low value.
- **2:** mostly enforced already, wrong evidence, or many false positives.
- **1:** not a standard.

Score the mistake that a proposal prevents and the valid code that it accepts, not its step. An instruction with a reason and an example can score 5, and a rule that reports valid code scores 2.

Show the candidates with a score of 4 or 5, from the highest score to the lowest. Show each one with:

- the standard in one sentence
- its source: the instruction file and line, the code only, or the fix commits
- the number of places that follow it, its scope, and the counterexamples
- its step on the ladder, and the rule, option, or instruction that you propose
- the case that the proposal must prevent, and the similar case that it must accept
- the part of the standard that stays an instruction, if a part stays
- the existing code that the new rule would report, and whether you propose to fix it in the same change

Then show three short lists:

- **Decisions:** each written standard that the code does not follow, each rule that a commit removed, each choice from step 7, each rule with many suppressions, and each gap in a shipped rule that no option can close. Give the instruction, the code, and the choice that the maintainer must make.
- **Discovery gaps:** the gaps from step 1. Propose a pointer only for the standards that stay instructions, because a rule replaces the instruction that a pointer would lead to. For a broken link, propose the correct target.
- **Also considered:** the candidates with a score of 3 or lower, and each candidate or decision that step 7 matched with a decision of the record, one line for each, with the reason or the `id` of the decision.

When no human can approve, for example in CI or in an unattended session, report the candidates and stop after this step. Write no file, also not the decisions record.

Otherwise, put the approval question last in the report, with no text after it. Ask the user which named candidates to write. Wait until the user names the candidates to write or approves none.

After the user answers, append to the decisions record. It is the only project file that you change before step 9. Create the file when it does not exist.

- Append this session line in each session that the user answers, also when the user approves every candidate or none. It records how far this session read the fix history, so the next session reads only the commits after it:

  ```jsonl
  {{sessionLine}}
  ```

- Append one line for each candidate that you showed and that the user did not approve, and one for each item of the Decisions list that the user resolved. An approved candidate needs no line, because its rule or instruction is the trace. The exception is an approved candidate whose `id` the Decisions section shows: append a line with that `id` and the decision `approved`, so the earlier decision no longer applies.
- Never edit or delete an earlier line. To change a decision, append a line with the same `id`. The one edit is the repair of a line that the Decisions section lists as not decoded.
- Write one JSON object on one line, with no trailing comma, and end the line with a newline. Leave out a key that has no value.
- Copy the form of this line:

  ```jsonl
  {{decisionExample}}
  ```

- `id` is kebab-case and stays the same for a standard: reuse the `id` that the Decisions section shows when the standard was decided before. `at` is `{{today}}`, the date of today. `standard` is the standard in one sentence.
- `decision` is `rejected`, `deferred` when the user wants to decide later, `decided` for a resolved item of the Decisions list, or `approved`. `reason` is the reason that the user gave, or the choice of a `decided` line.
- `rule` is the rule or the ladder step that you proposed. {{decisionScope}} `follow` and `break` are the numbers of places that follow and break the standard, and `fixes` are the short hashes of the fix commits that you saw.
- Tell the user to commit the record with the other changes of the session, because the next session takes its decisions and the start of its fix history from it.

If the user approves none, stop after you append the lines, without another change to the project files.

## 9. Write the approved standards

Write only the approved candidates:

- **Type, structure, preset rule, import rule, or project check:** change the types, the Oxlint config, `tsconfig.json`, or the check.
- **Custom rule:** read `skills/{{hardeningSkill}}/SKILL.md` in the installed `adamantite` package. Follow its "{{customRulesSection}}" section and linked guide to write, verify, and clean up the approved rule. Run `adamantite rule add <name>`. When the rules folder above is not `.adamantite/lint`, pass it with `--dir`. A comment at the top of the rule file states the standard and why it exists.
- **Gap in a custom rule:** create a temporary regression case first, and use RuleTester to see it fail. Follow the custom-rule guide above until all valid and invalid cases pass and cleanup is complete.
- **Gap in the config of a rule,** such as a layer map, an import-owners option, a `no-restricted-imports` path, or an override glob: change the Oxlint config. Then lint a file that has the missed form, and read the report. When no file has the form, tell the user that the change is not verified. Do not change a rule that a preset or plugin ships.
- **Override that can shrink:** remove only the files that no longer break the rule.
- **Instruction that became a rule:** delete the text that only repeats what the rule now reports. The rule is the source of that part. Keep the reason and the example of a standard that shapes a design, such as which module owns an import, because an agent needs them before it writes the code. Keep the part of the standard that the rule does not check.
- **Existing violations:** fix the code that a new rule reports in the same change when the user approved the fixes with the candidate and each fix keeps the behavior of the code. The rule then needs no override. Otherwise, keep the code as it is, keep the rule at `error`, and add an `overrides` entry to the Oxlint config that turns the rule off only in the files that break it now, such as `{ files: ["src/legacy/cart.ts"], rules: { "project/no-foo": "off" } }`. A file in the override can gain new violations without a report. In a comment above the entry, state the change that removes each file from it, and list the files and their violations for the user. Do not set the rule to `warn`: `adamantite check` fails on warnings. New files must follow the rule.
- **Instruction:** write each approved standard that needs judgment, or that no tool can check, to `CODING_STANDARDS.md` as one entry. The entry states the standard, the reason for it, how to spot the mistake, and one example from the project of the code to avoid and the code to prefer. When no `AGENTS.md` points to `CODING_STANDARDS.md`, add the pointer to the root `AGENTS.md`.
- **Discovery gap:** add each approved pointer to the `AGENTS.md` that the gap names, or to a file that it reaches, as a Markdown link. Fix each approved broken link.

Continue when every approved candidate is implemented and each changed custom rule has passed the guide's verification and cleanup checks.

## Verify

Run `adamantite check` and `adamantite doctor` in this order, through the project's package runner. Both must exit 0. When you changed a project check, also run that check with the project's own command, from the folder where CI runs it. Read the output of every check.

When a new rule makes `check` fail, fix the rule, fix the code, or add the file to the override as step 9 says, not a disable comment. Do not add saved rule tests or CI steps unless the user requests them. Preserve user-owned tests and CI steps.

When you changed the documentation, run `adamantite harden` again without a terminal and read its agent reach. Do not restart this procedure. Each discovery gap that you closed must be gone, and no link that you added may go to a file that does not exist.

Continue when the required checks pass, the approved discovery gaps are closed, and no temporary verification cases, fixtures, or verification-only helpers remain. If a check is blocked, record its command and reason instead of claiming completion.

## Report the result

Use the missing-source report format from step 8. Report the approved candidates implemented, the lines that you appended to the decisions record, changed files, verification cases and results, commands run, and remaining violations or decisions. State whether temporary verification files were removed. Keep unverified results separate from successful checks.

The report is complete when each approved candidate has a verified result or an explicit blocker. Use this report only after approval and implementation. Before approval, use the proposal and closing question in step 8.

## Check the result

- Every project change implements an approved candidate and stays inside the selected scope, or is a line of the decisions record.
- The decisions record has the session line, and a line for each candidate that the user did not approve and each decision that the user resolved. Each line is one JSON object, and the record is unchanged when no human answered.
- Each new or changed custom rule passed valid and invalid cases, including a regression case for a bug fix.
- Temporary verification files are removed, and user-owned tests and CI steps remain.
- Project checks and Doctor pass, or the report names each blocked check and remaining finding.
- Approved discovery gaps are closed, and added documentation links resolve.
