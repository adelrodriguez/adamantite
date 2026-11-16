---
"adamantite": minor
---

Warn about import layers that an Oxlint config states by hand

`adamantite doctor` now warns when an Oxlint config turns on `no-restricted-imports` with `patterns` in two or more `overrides` entries, as a hand-written layer map does. Oxlint replaces the options that an earlier override set for the same files, so each override repeats the patterns of the ones before it. The `adamantite/layers` rule states the same layers in one layer map. The warning names the config, counts the overrides, and gives the steps to move them into layer maps. It tells you to keep each override that bans imports from another workspace package, because a layer map checks only the imports inside one package. Doctor checks the root config and the config of each workspace package, and counts overrides that a `.map()` callback builds. It is a warning, not a finding, so Doctor still exits 0.
