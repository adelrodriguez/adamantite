---
"adamantite": patch
---

Accept an `Effect.map` or `Option.map` callback that returns nothing in the effect preset

The effect lint preset now turns off the core rule `array-callback-return`. The rule matches an array method by its name only, so it reported `Effect.map((text) => { log(text) })` as an `Array.prototype.map` callback that does not return on all code paths. The autofix of `typescript/no-confusing-void-expression` writes this form, so the fix of one core rule caused a report of another. In a project with the effect preset, a callback of a native array method that returns nothing is no longer reported. The type check still reports a callback that returns a value on only some paths when `noImplicitReturns` is on, as in `adamantite/tsconfig` and `adamantite/typescript`.
