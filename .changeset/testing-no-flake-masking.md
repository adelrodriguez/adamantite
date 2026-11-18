---
"adamantite": minor
---

Report test retries and raised test timeouts in the strict preset with `testing/no-flake-masking`

The strict preset loads a new first-party plugin, `testing`, and turns on `testing/no-flake-masking` in the test files of the jest and vitest presets. A test that passes only on a retry is flaky, and a raised timeout hides a slow or stuck test. The rule reports a `retry` or `timeout` option of a test or suite, a timeout after the test function, such as `it("loads", fn, 60_000)`, `vi.setConfig()` with `retry`, `testTimeout`, or `hookTimeout`, `jest.retryTimes()`, `jest.setTimeout()`, and `flakyTest` of `@effect/vitest`. In a `vite.config.*` or `vitest.config.*` file, it reports `retry` in the `test` options.

A hook timeout, such as `beforeAll(setup, 60_000)`, a timeout of `expect.poll()` or `vi.waitFor()`, `testTimeout` or `hookTimeout` in the Vitest config, and a timeout in a benchmark file, such as `index.bench.ts`, stay allowed.

To fix a report, remove the retry or the timeout, and await the event that the test depends on, or control time with `TestClock` or fake timers. A test that must keep its timeout suppresses the rule with a reason, such as `// oxlint-disable-next-line testing/no-flake-masking -- the test builds the whole package`.
