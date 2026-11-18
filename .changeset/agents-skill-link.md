---
"adamantite": patch
---

Link the Adamantite section of `AGENTS.md` to each copy of the Adamantite skill

The `AGENTS.md` that `adamantite init --agents` writes named the skill only by its path in the installed package. `adamantite harden` then listed the skill and its three guides in `.agents/skills/adamantite` as files that no `AGENTS.md` reaches, and an agent without skill discovery of its own did not find them.

The section now links to `SKILL.md` in `.agents/skills/adamantite`, and in each other skill folder that the project uses, such as `.claude/skills/adamantite`. `adamantite update` writes the new section to an `AGENTS.md` that is unchanged since Adamantite wrote it. In an `AGENTS.md` that you changed, add the links yourself. The `missing-agents-section` finding now names each `SKILL.md` that the section must link to.
