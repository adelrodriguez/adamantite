---
"adamantite": patch
---

Add a guide to the Adamantite skill for keeping a fixed mistake from recurring

The skill has a new section, "Keep a fixed mistake from recurring", with the guide `references/corrections.md`. An agent follows it after it fixes a regression, a mistake that a reviewer corrected before, or a break of a project standard that no check reported. The guide starts from that one mistake, chooses a step of the enforcement ladder, such as a test, a type, a rule, or an instruction, and proves the choice. A regression test needs no approval. A new standard waits for yours. `adamantite harden` stays the audit of every standard of the project.

The Adamantite section that `init --agents` writes to `AGENTS.md` now sends agents to that section of the skill. `adamantite update` writes the new section to an `AGENTS.md` that is unchanged since Adamantite wrote it.

The skill also tells agents that `adamantite check` does not run the project's tests, so they run the tests of each changed behavior. The setup guide tells agents who move a replaced script's command to another script to make CI and Git hooks run that script, because the workflow that Adamantite writes runs only the managed scripts.
