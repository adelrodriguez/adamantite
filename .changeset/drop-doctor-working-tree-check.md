---
"adamantite": patch
---

Remove the Git working tree check from the `adamantite doctor` agent handoff. Doctor no longer warns or asks for confirmation before starting an agent on a dirty tree, and the repair prompt no longer tells the agent to check for a clean tree.
