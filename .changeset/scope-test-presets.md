---
"adamantite": minor
---

Scope the `jest` and `vitest` presets to test files. Each preset now exports `testFiles`, the files
that its test runner runs as tests by default. `init` adds each test preset in an `overrides` entry
for its `testFiles`, not in the global `extends`, so test rules such as `vitest/require-hook` no
longer report scripts and library code. Doctor reports a test preset in the global `extends`, with
the override as the goal.
