---
"adamantite": patch
---

Leave agent skills out of the documentation that `adamantite harden` lists

`adamantite harden` listed each Markdown file in a skill folder, such as `.agents/skills` or `.claude/skills`, as documentation, and as a file that no `AGENTS.md` reaches. In a project that `adamantite init --agents` had just set up, it listed the Adamantite skill and its guides that way, once for each skill folder.

A coding agent finds the skills in its skill folder on its own, so no `AGENTS.md` has to link to them. The harden prompt and `harden --json` now leave the files of each skill folder out of `documentationFiles` and `agentReach`, in the root and in each workspace package.
