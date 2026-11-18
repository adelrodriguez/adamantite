# How to keep a fixed mistake from recurring

Use this guide after you fix a regression, after a reviewer corrects the same thing again, or
after you find that code broke a standard of the project and no check reported it. The guide
decides what the project keeps, so that the next agent does not repeat the mistake. It starts
from that one mistake. To audit every coding standard of the project, run `adamantite harden`.

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
- For a choice that needs judgment, write an instruction as the ladder describes its entry.
- When the fix and its test already prevent the mistake, keep nothing more.

Keep the lesson in the target project. A change to an Adamantite preset is a different task,
which needs the same mistake in independent projects.

A regression test for the fix needs no approval. A new rule, type, or instruction is a new
standard for the project. Show the user the standard, the occurrences, the step, and the similar
correct case, and wait for approval before you write it. If no human can approve, report the
proposal and stop.

Continue when the choice is a test, or nothing, or the user approved the standard.

## Prove the choice

Prove that the choice prevents the mistake and accepts the similar correct case:

- For a test, read its failure on the code before the fix, then run it on the fixed code. It
  must pass.
- For a type or a constructor, put the mistake back in a temporary edit and run
  `adamantite check`. It must fail on that edit. Remove the edit.
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
- The choice is the highest step that prevents the mistake and accepts the correct case.
- Every new standard has the user's approval, and a test or no change needed none.
- Each proof ran, and the project's checks and the tests of the changed code pass.
- The lesson stays in the target project, and no temporary edit or case file remains.
