---
"adamantite": patch
---

Tell agents that a code comment does not hold a standard

The enforcement ladder in the `adamantite-hardening` skill now says that a code comment is not a step. When a comment states a standard or an invariant of the project's own code, the agent puts the standard on a step of the ladder, such as a type, a rule, or a test, and deletes the comment. The harden prompt shows the ladder, so `adamantite harden` gives the same instruction.
