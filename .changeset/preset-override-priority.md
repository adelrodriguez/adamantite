---
"adamantite": patch
---

Document which preset rules need an `overrides` entry to change

A top-level `rules` setting has no effect on a rule that a preset sets in an override, for the files of that override, and Oxlint gives no warning. The README now gives the order in which Oxlint applies `rules` and `overrides`, and lists the files and rules of each override in the core, strict, tailwind, jest, and vitest presets. The strict, tailwind, and test preset sections link to it.
