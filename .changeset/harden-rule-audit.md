---
"adamantite": patch
---

`adamantite harden` audits the rules that the project already has. The agent lists the forms of a mistake that a rule misses, the files that an override glob misses, the files that an override no longer needs, and the rules with many suppressions. To fix a gap, the agent runs a temporary RuleTester regression case first and sees it fail, then removes the verification cases and fixtures before handback.
