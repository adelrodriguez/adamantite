---
"adamantite": patch
---

Turn off the core rules that read Effect functions as built-in methods in the effect preset

These core rules match a method by its name only, so they reported Effect code as misused promises, strings, and arrays. The effect lint preset now turns them off:

- `promise/valid-params` reported the data-first `Effect.catch(load("a"), () => load("b"))` as `Promise.catch()` with 2 arguments.
- `promise/no-nesting` reported an `Effect.catch` in the handler of another `Effect.catch` as a nested promise.
- `array-callback-return` reported an `Effect.map` or `Option.map` callback that returns nothing, which is the form that the fix of `typescript/no-confusing-void-expression` writes.
- `unicorn/prefer-string-slice` rewrote `String.substring(1)` from `effect/String` to `String.slice(1)`, a different Effect function that reads a negative index from the end.
- `unicorn/prefer-array-find` and `unicorn/prefer-array-some` reported `Array.filter(values, predicate)[0]` and `Array.filter(values, predicate).length > 0` from `effect/Array`, which has no `find`.
- `unicorn/throw-new-error` reported an error class that `Schema.TaggedError` or `Schema.Error` makes as an error made without `new`, and its fix broke the class. The rule stays off until Oxlint fixes [oxc-project/oxc#27718](https://github.com/oxc-project/oxc/issues/27718).

In a project with the effect preset, these rules no longer report the same patterns on native promises, strings, and arrays. The type check still reports a promise method call with the wrong arguments, and, with `noImplicitReturns` as in `adamantite/tsconfig` and `adamantite/typescript`, a callback that returns a value on only some paths.
