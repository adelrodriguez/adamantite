---
"adamantite": patch
---

Stop two rules in the `vitest` and `jest` lint presets from reporting correct tests.

- `vitest`: `no-standalone-expect` now accepts `expect` in the test functions of `@effect/vitest`: `it.effect`, `it.live`, and `it.prop`, with their `each`, `fails`, `only`, `prop`, `runIf`, `skip`, and `skipIf` forms. Before, the rule reported every `expect` in an `it.effect` test.
- `vitest` and `jest`: `prefer-expect-assertions` now reports only `async` tests and tests that call `expect` in a callback or a loop, where an `expect` can fail to run. Before, the rule required `expect.assertions()` or `expect.hasAssertions()` in every test, also in synchronous tests where every `expect` always runs.
