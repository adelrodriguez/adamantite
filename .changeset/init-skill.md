---
"adamantite": minor
---

`adamantite init` now adds the Adamantite skill for coding agents. One question asks for the `AGENTS.md` section and the skill folders: `.agents/skills` for Codex, Cursor, Gemini CLI, and OpenCode, `.claude/skills` for Claude Code, and `.grok/skills` for Grok Build. `.agents/skills` is selected by default, with the folder of each agent whose CLI is installed. `--skill-agent <agent>` selects the folders in non-interactive mode. The CLI bundles the skill and writes it directly, so the skill matches the running Adamantite version and needs no network, `npx`, or `node_modules` copy. `adamantite update` writes the skill again to each folder whose copy differs in any file, and removes the `adamantite` entry from `skills-lock.json`.
