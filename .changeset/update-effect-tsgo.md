---
"adamantite": minor
---

Update `@effect/tsgo` to 0.63.0, and enable five new rules in the effect preset

The effect preset enables these new `@effect/tsgo` rules. Each one reports a combinator that has a direct replacement:

- `fail-cause-to-constructor` reports `Effect.failCause` or `Effect.failCauseSync` around a single `Cause.fail` or `Cause.die`. Use `Effect.fail`, `Effect.die`, `Effect.failSync`, or `Effect.dieSync`.
- `flat-map-identity-to-flatten` reports `Effect.flatMap` with a callback that returns its parameter. Use `Effect.flatten`.
- `manual-metric-tap-to-track` reports an `Effect.tap`, `Effect.tapError`, or `Effect.tapDefect` that only updates a metric. Use `Effect.trackSuccesses`, `Effect.trackErrors`, or `Effect.trackDefects`.
- `map-const-to-as` reports an `Effect.map` callback that ignores its input and returns a constant. Use `Effect.as`.
- `map-map-error-to-map-both` reports `Effect.map` and `Effect.mapError` as adjacent steps of one pipe. Use `Effect.mapBoth`.

To upgrade an existing project:

- Run `adamantite update`. It installs the new version and patches Oxlint and TypeScript again.
- Expect `adamantite check` to report the code that these rules describe.
- `@effect/tsgo` 0.63.0 patches TypeScript 7.0.2, 7.1.0-beta, and `7.1.0-dev.20261028.1`. With another TypeScript version, the `prepare` script fails. Install one of those versions.
