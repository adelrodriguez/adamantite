# How to keep a fixed mistake from recurring

Use this guide after you fix a regression, after a reviewer corrects the same thing again,
after you find that code broke a standard of the project and no check reported it, or before you
add a disable comment for a lint rule. The guide decides what the project keeps, so that the next
agent does not repeat the mistake. It starts from that one mistake. To audit every coding
standard of the project, run `adamantite harden`.

## Fix the code before a disable comment

Follow this step only when you came to this guide before you add a disable comment. After a
fix or a review correction, start at the next step.

When a rule reports code that you wrote, fix the code. When a suppression is necessary, state
after `--` why the rule does not apply, as
[How to repair preset rule reports](lint-rules.md#repair-the-reported-code) says.
`adamantite/require-suppression-reason` reports a suppression without a reason.

Before you add the comment, search the code for disable comments of the same rule, such as with
`rg "oxlint-disable.*<rule>"`. When a comment already suppresses the rule for the same reason,
the rule and the code disagree about a standard. That repeated suppression is the mistake for
the steps below, so add no further comment.

The guide ends here when the code passes without a suppression, or when one suppression states
a reason that no other comment gives. Continue when the repeated suppression is the mistake.

## Start with the mistake

Reproduce the mistake with the project's own command, such as its test command, and read the
failure. Search the code and the recent fix commits for the same mistake in another place. Find
the closest code that looks similar and is correct.

Weigh the evidence before you propose a standard:

- One occurrence justifies a regression test. It does not justify a standard for the project.
- A second occurrence, or a correction that a reviewer repeats, is evidence of a coding standard.
- Code that repeats a pattern, without a fix or a review comment for it, is weak evidence.

Continue when you have the case that failed, each other occurrence with its file and line or the
note "none found", and one similar case that is correct.

## Check whether a tool already reports the mistake

When a lint rule can report the mistake, run
`adamantite rule try <rule> --current --report <case>` with the case that failed, as
[Try a rule setting](lint-rules.md#try-a-rule-setting) says. The project file already holds the
fix, so give the code before the fix as `<path>=<file>`, with the file outside the project. Try
each rule of the config that can report the mistake. When the config reports the case, a tool already holds the standard:
fix the code, and stop. A repeated suppression is the exception, because its rule reports the
code already.

Continue when a trial shows that no rule of the config reports the case, when no lint rule can
report the mistake, or when the mistake is a repeated suppression.

## Choose what the project keeps

Choose the highest step of [the enforcement ladder](enforcement-ladder.md) that prevents the
mistake and accepts the similar correct case:

- For wrong behavior, such as an expiry check that used `>` at the deadline, keep a test that
  fails on the mistake.
- For an invalid value that reaches an API, change the type or the constructor of that value.
- For a package or module that only one file or folder may import, set
  `adamantite/import-owners`, as
  [How to repair preset rule reports](lint-rules.md#configure-layer-maps-and-import-owners) says.
- For a mistake that has one syntax, write a custom rule, as
  [How to write and verify custom rules](custom-rules.md) says.
- For a rule that needed the same suppression more than once, state the exception once, in an
  option of the rule or in an override for the files that the exception applies to, and remove
  the comments. When the rule is right and the code is wrong, fix the code and keep nothing more.
- For a choice that needs judgment, write an instruction as the ladder describes its entry.
- When the fix and its test already prevent the mistake, keep nothing more.

Keep the lesson in the target project. A change to an Adamantite preset is a different task,
which needs the same mistake in independent projects.

A regression test for the fix needs no approval. A new rule, type, or instruction, or a change
to what a rule reports, is a new standard for the project. An exception that only makes the check
pass weakens the standard, so state the reason that the suppressions gave. Show the user the standard, the occurrences, the step, and the similar
correct case, and wait for approval before you write it. If no human can approve, report the
proposal and stop.

Continue when the choice is a test, or nothing, or the user approved the standard.

## Prove the choice

Prove that the choice prevents the mistake and accepts the similar correct case:

- For a test, read its failure on the code before the fix, then run it on the fixed code. It
  must pass.
- For a type, put the mistake back in a temporary edit and run `adamantite check`. The type
  check must fail on that edit. Remove the edit.
- For a constructor or a schema that rejects a value at run time, keep a test that gives it the
  invalid value and the similar valid value. `adamantite check` does not run the constructor, so
  only the test proves it. The test must pass on the fixed code.
- For a rule or a rule option, run
  `adamantite rule try <rule> --report <mistake> --accept <correct case>`, as
  [Try a rule setting](lint-rules.md#try-a-rule-setting) says. It must exit 0. For a custom
  rule, complete the verification and cleanup of its guide.
- For an instruction, run `adamantite harden --json` and read `agentReach`. Its `unreached`
  list must not name the file that holds the instruction, and `brokenLinks` must be empty for
  the links that you added.

Then run the project's checks and the tests of the changed code. `adamantite check` proves
formatting, lint rules, and types. It does not run the project's tests.

Continue when each proof gave the expected result and no temporary edit or case file remains.

## Check the result

- The report names the mistake, each other occurrence, and the similar correct case.
- When a lint rule can report the mistake, a trial showed that no rule of the config reports it.
- The choice is the highest step that prevents the mistake and accepts the correct case.
- No new disable comment repeats a suppression of the same rule for the same reason.
- Every new standard has the user's approval, and a test or no change needed none.
- Each proof ran, and the project's checks and the tests of the changed code pass.
- The lesson stays in the target project, and no temporary edit or case file remains.
