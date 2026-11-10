---
"adamantite": minor
---

Install the Adamantite skill for coding agents in `adamantite init`

One question asks whether to set up coding agents. A yes, or `--agents` in non-interactive mode, adds the `AGENTS.md` section and writes the skill to `.agents/skills`, which Codex, Cursor, Gemini CLI, and OpenCode read. Init also writes the skill to `.claude/skills` when the project has `.claude/`, and to `.grok/skills` when it has `.grok/`. The CLI bundles the skill and writes it directly, so the skill matches the running Adamantite version and needs no network, `npx`, or `node_modules` copy. `adamantite update` writes the skill again to each folder whose copy differs in any file, and removes the `adamantite` entry from `skills-lock.json`.
