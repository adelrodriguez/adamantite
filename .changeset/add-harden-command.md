---
"adamantite": minor
---

Add `adamantite harden`. It prints a Markdown prompt that tells a coding agent to find the coding
standards that the project already follows, drop the ones that a tool already enforces, and put
each remaining one at the highest level of enforcement that works: a custom rule when a rule can
check it, and a line in `CODING_STANDARDS.md` when no rule can. The agent writes nothing until the
user approves the candidates. The prompt lists the Oxlint config, the rules folder that its
`custom()` call loads, and the prose files that exist.
