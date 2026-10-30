---
"adamantite": patch
---

Doctor reports a project that has managed scripts and no `AGENTS.md` at its root. `AGENTS.md` is
the instruction file that most coding agents read, and Claude Code reads it when the project has no
`CLAUDE.md`. In a monorepo, Doctor checks only the root. The finding gives the
`adamantite init --agents` command as one way to create the file.
