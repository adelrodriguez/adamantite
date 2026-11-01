---
"adamantite": minor
---

Add `adamantite rule try`, which lints cases in a copy of the project with one rule setting and shows whether the rule reports each case. It exits 0 when each case is as expected, 1 when a case is not, and 2 when the trial is not evidence, such as for a rule that does not exist. The `adamantite harden` prompt now uses it instead of a trial copy that the agent makes by hand, and shows the disable comments of each rule and the files that an override no longer needs.
