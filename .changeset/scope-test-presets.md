---
"adamantite": minor
---

Scope the `jest` and `vitest` presets to test files. A config that extends a test preset now gets
its rules only for the files that the test runner runs as tests by default, so rules such as
`vitest/require-hook` no longer report scripts and library code. Each preset exports these files as
`testFiles`. To use other files or change a rule, use the preset in an override of your own:
`{ files: [...testFiles, "e2e/**/*.ts"], plugins: vitest.plugins, rules: { ...vitest.rules } }`. A
top-level `rules` entry no longer changes a test rule in test files.
