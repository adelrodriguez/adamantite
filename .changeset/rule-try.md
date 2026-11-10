---
"adamantite": minor
---

Add `adamantite rule try` to check a rule setting against cases

`adamantite rule try` lints cases in a copy of the project with one rule setting, and shows whether the rule reports each case. It exits 0 when each case is as expected, 1 when a case is not, and 2 when the trial is not evidence, such as for a rule that does not exist. The README command reference documents its case forms, rule settings, and exit codes.
