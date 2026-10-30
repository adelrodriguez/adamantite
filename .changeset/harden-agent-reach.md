---
"adamantite": patch
---

`adamantite harden` lists the Markdown files that no agent instruction file, such as `AGENTS.md` or `CLAUDE.md`, reaches through links, `@` imports, or code-span paths. It also lists each `AGENTS.md` that a `CLAUDE.md` hides from Claude Code and each link to a missing file, and the agent reports them as discovery gaps. After a handoff, `harden` fails when the session added a link to a missing file, and warns when a `CLAUDE.md` still hides an `AGENTS.md`.
