---
"adamantite": minor
---

Write the Adamantite skill and a new `AGENTS.md` as managed files, and stop splicing the `AGENTS.md` section

`adamantite init --agents` now writes `AGENTS.md` with the Adamantite section only when the project has no `AGENTS.md`, and never splices the section between the `<!-- ADAMANTITE:START -->` and `<!-- ADAMANTITE:END -->` comments of an existing file. `adamantite doctor` reports an `AGENTS.md` without the section with the new `missing-agents-section` finding, and the `missing-agents-md` finding now says to run `adamantite update`.

Each file of the Adamantite skill in `.agents/skills`, `.claude/skills`, and `.grok/skills` is now a managed file of the recorded setup. `adamantite update` writes the skill of a new version over each copy that nobody changed since Adamantite wrote it, and deletes it when the setup no longer includes agent guidance. It no longer rewrites a copy that differs from the shipped skill and from what Adamantite wrote, by its hash in the lockfile, so a copy in the layout of the project's Oxfmt config passes. Doctor reports a differing copy with the new `stale-adamantite-skill` finding, which says to delete the copy and run `adamantite update`. A copy that an earlier version wrote before the lockfile gets that finding once. When the setup includes agent guidance and a copy misses a file of the skill, Doctor reports the new `missing-adamantite-skill` finding, and `adamantite update` writes the missing file.
