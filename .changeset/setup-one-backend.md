---
"adamantite": minor
---

Run `init` and `update` through one setup backend, and report the skills lock entry instead of editing it

`init` and `update` now differ only in where the selection comes from: `init` takes it from the prompts or the flags and adds it to the recorded selection, and `update` takes it from `.adamantite/adamantite-lock.json`. Both then install the packages, set the managed scripts, write the managed files, write the lockfile, and report the findings that remain, so `init` now prints the findings that `adamantite doctor` would report, such as a missing extension in a `.vscode/extensions.json` that you changed. The lockfile line now reads the same in both commands.

`update` no longer removes the `adamantite` entry from `skills-lock.json`, because Adamantite does not edit a file that another tool owns. When the setup includes agent guidance and the lock records the skill, `adamantite doctor` reports a `skills-lock-adamantite-entry` finding, and a coding agent removes the entry.
