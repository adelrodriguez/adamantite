---
"adamantite": patch
---

Doctor reports a project that has managed scripts and no `AGENTS.md` at its root. `AGENTS.md` is
where coding agents start, and it points to the other documentation of the project. In a monorepo, Doctor checks only the root. The finding gives the
`adamantite init --agents` command as one way to create the file.
