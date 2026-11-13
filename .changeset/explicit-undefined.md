---
"adamantite": patch
---

Accept an explicit `undefined` in the core preset

The core lint preset no longer enables `unicorn/no-useless-undefined`. Its fix removed an `undefined` that other rules or the type checker need. It rewrote `() => undefined` to `() => {}`, which `no-empty-function` reports. It rewrote `return undefined` in a `map` callback to a bare `return`, which `array-callback-return` and `no-useless-return` report. With the effect preset, it rewrote `Effect.succeed(undefined)` to `Effect.succeed()`, which fails the type check. The effect preset still reports `Effect.succeed(undefined)` and asks for `Effect.undefined`. Suppressions that name `unicorn/no-useless-undefined` are now unused, so you can delete them.
