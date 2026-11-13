---
"adamantite": patch
---

Accept an `Effect.catch` in the handler of another `Effect.catch` in the effect preset

The effect lint preset now turns off the core rule `promise/no-nesting`. The rule matches `then` and `catch` by name only, so it reported a fallback inside a fallback, such as `Effect.catch(() => load("b").pipe(Effect.catch(() => load("c"))))`, as a nested promise. In a project with the effect preset, the rule no longer reports a nested `then()` or `catch()` on a `Promise`.
