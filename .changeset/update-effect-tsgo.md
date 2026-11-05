---
"adamantite": minor
---

Update `@effect/tsgo` to 0.67.1, and enable 14 new rules in the effect preset

The effect preset enables these new `@effect/tsgo` rules:

- `effect-try-without-catch` reports `Effect.try` and `Effect.tryPromise` without a `catch` handler, whose failures become a generic `UnknownError`. Use the object form `{ try, catch }` and map the cause to a typed error.
- `global-json-in-effect` reports `JSON.parse` and `JSON.stringify` inside Effect generators, because they throw instead of failing with a typed error. Use `Schema.fromJsonString(schema)` with `Schema.decodeEffect` or `Schema.encodeEffect`.

The other new rules report a combinator or construct that has a direct replacement:

- `effect-succeed-with-undefined` reports `Effect.succeed(undefined)`. Use `Effect.undefined`.
- `fail-cause-to-constructor` reports `Effect.failCause` or `Effect.failCauseSync` around a single `Cause.fail` or `Cause.die`. Use `Effect.fail`, `Effect.die`, `Effect.failSync`, or `Effect.dieSync`.
- `flat-map-identity-to-flatten` reports `Effect.flatMap` with a callback that returns its parameter. Use `Effect.flatten`.
- `manual-metric-tap-to-track` reports an `Effect.tap`, `Effect.tapError`, or `Effect.tapDefect` that only updates a metric. Use `Effect.trackSuccesses`, `Effect.trackErrors`, or `Effect.trackDefects`.
- `map-const-to-as` reports an `Effect.map` callback that ignores its input and returns a constant. Use `Effect.as`.
- `map-map-error-to-map-both` reports `Effect.map` and `Effect.mapError` as adjacent steps of one pipe. Use `Effect.mapBoth`.
- `map-some-catch-no-such-element` reports `Effect.map(Option.some)` followed by a `catchTag` of `NoSuchElementError` that succeeds with `Option.none()`. Use `Effect.catchNoSuchElement`.
- `match-boolean-to-is-success` reports `Effect.match` that folds to `true` and `false`. Use `Effect.isSuccess` or `Effect.isFailure`.
- `match-to-result-or-option` reports `Effect.match` handlers, or a map step followed by a catch step, that only turn the outcome into a value. Use `Effect.result` or `Effect.option`.
- `provide-merge-all-to-array` reports `Effect.provide(Layer.mergeAll(a, b))`. Use `Effect.provide([a, b])`.
- `result-match-to-from-result` reports a `Result.match` that only turns a success into `Effect.succeed` and a failure into `Effect.fail`. Use `Effect.fromResult`.
- `suspend-fail-to-fail-sync` reports `Effect.suspend` around a single `Effect.fail` or `Effect.die`. Use `Effect.failSync` or `Effect.dieSync`.

The preset does not enable `global-json`, which reports `JSON` calls outside Effect code, or the style preferences `type-union-to-schema-union` and `yield-in-call-argument`.

To upgrade an existing project:

- Run `adamantite update` to install the new version.
- Expect `adamantite check` to report the code that these rules describe.
- `@effect/tsgo` 0.67.1 has Effect builds for Oxlint 1.88.0, 1.89.0, 1.90.0, and 1.91.0, and for oxlint-tsgolint 7.0.2004 and 7.0.2005.
- If you run `effect-tsgo patch --typescript` yourself, 0.67.1 patches TypeScript 7.0.2, 7.1.0-beta, and `7.1.0-dev.20261103.1`.
