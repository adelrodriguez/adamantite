---
"adamantite": minor
---

Scope the `jest` and `vitest` presets to test files. `init` now adds each test preset in an
`overrides` entry for `**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}` and `**/__tests__/**`,
not in the global `extends`, so test rules such as `vitest/require-hook` no longer report scripts
and library code. Doctor reports a test preset in the global `extends`, with the override as the
goal.
