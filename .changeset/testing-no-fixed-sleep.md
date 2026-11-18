---
"adamantite": minor
---

Report a fixed sleep in a test or a hook in the strict preset with `testing/no-fixed-sleep`

The strict preset turns on `testing/no-fixed-sleep` in the test files of the jest and vitest presets. It reports a fixed sleep in the body of a test or a hook, such as `await new Promise((resolve) => setTimeout(resolve, 100))`, `await setTimeout(100)` of `node:timers/promises`, `scheduler.wait()`, `Bun.sleep()`, and `yield* Effect.sleep()` in the generator of an Effect test. A sleep guesses how long the work takes, and fails under load.

To fix a report, await the operation, or a promise that its handler resolves. To move time, use fake timers or `TestClock`. A file that calls `vi.useFakeTimers()` or `jest.useFakeTimers()`, or uses `TestClock`, gets no report. A sleep in a helper or a handler, such as simulated latency in a mock server, stays allowed.
