---
"adamantite": minor
---

Add `update` command to keep dependencies in sync

Adds a new `adamantite update` command that updates installed dependencies (@biomejs/biome and sherif) to match the versions specified by adamantite. The command automatically detects the package manager, compares versions, and updates only outdated packages with user confirmation.
