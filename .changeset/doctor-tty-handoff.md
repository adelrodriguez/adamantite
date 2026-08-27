---
"adamantite": minor
---

Let interactive `adamantite doctor` hand findings off to an installed coding agent:
Claude Code, Codex, Cursor, Gemini CLI, Grok Build, or OpenCode. Doctor detects
installed agents by probing each CLI and only offers the ones on `PATH`, then starts the
selected agent in the terminal with a one-line seed prompt that tells the agent to run
Doctor itself, so the agent's own UI owns permissions, trust, and authentication and no
findings content appears in process arguments. Doctor warns before handing off a working
tree that is not known to be clean, reassesses once after the agent session ends, and
exits 0 only when no findings remain — the agent's exit code is ignored. Doctor ignores
Ctrl-C while the agent owns the terminal, so the signal reaches only the agent. When an
agent fails to start, the Markdown prompt copy remains available. Non-interactive output
is unchanged.
