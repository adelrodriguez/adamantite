---
"adamantite": patch
---

`adamantite harden` asks the agent to read the fix commits of the last 200 commits, or of the number that `--commits` gives. A mistake that two fixes have, or that the code still repeats, becomes a candidate, and the code before and after a fix become the cases of its rule.
