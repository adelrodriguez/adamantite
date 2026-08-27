---
"adamantite": minor
---

Let interactive `adamantite doctor` hand findings off to Claude Code or Codex. Doctor
starts the selected agent CLI in the terminal with a one-line seed prompt that tells the
agent to run Doctor itself, so the agent's own UI owns permissions, trust, and
authentication and no findings content appears in process arguments. Doctor warns before
handing off a working tree that is not known to be clean, reassesses once after the agent
session ends, and exits 0 only when no findings remain — the agent's exit code is
ignored. When the agent CLI is missing or fails to start, the Markdown prompt copy
remains available. Non-interactive output is unchanged.
