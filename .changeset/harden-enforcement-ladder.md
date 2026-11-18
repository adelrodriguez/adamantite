---
"adamantite": patch
---

State the enforcement ladder in one file, and stop the harden prompt from favoring lint rules

The harden prompt, the glossary, and `adamantite harden --help` described what hardening produces in three ways. The Adamantite skill now defines the enforcement ladder in `references/enforcement-ladder.md`, and the harden prompt shows that file in step 7. The ladder has six steps: a type or structure, a preset rule, an import rule, a project check, a custom rule, and an instruction. A project check now includes a test, which holds a standard about behavior.

The harden prompt changes in four places:

- It scores a candidate by the mistake that the proposal prevents and the valid code that it accepts, not by its step. An instruction with a reason and an example can score 5.
- An instruction is an entry in `CODING_STANDARDS.md` with the standard, the reason, how to spot the mistake, and an example from the project. It was one line.
- When a rule covers an instruction, the agent deletes only the text that repeats the rule's report. It keeps the reason and the example of a standard that shapes a design.
- The agent fixes the code that a new rule reports in the same change when you approve the fixes with the candidate. Otherwise it still turns the rule off in the files that break it, and now states in a comment above the override what removes each file from it.
