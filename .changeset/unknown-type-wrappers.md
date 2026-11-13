---
"adamantite": minor
---

Report `unknown` behind local aliases, `Awaited`, `NoInfer`, and iterables in the strict preset

`anti-slop/no-unknown-parameters`, `anti-slop/no-unknown-returns`, and `anti-slop/no-unknown-type-aliases` now share one check for `unknown`. All three rules resolve local type aliases, as in `type Box<T> = T` with `Box<unknown>`, and see through `Awaited<unknown>` and `NoInfer<unknown>`. `anti-slop/no-unknown-returns` also reports `globalThis.Promise<unknown>`, `Iterable<unknown>`, `AsyncIterable<unknown>`, `AsyncIterator<unknown>`, `Generator<unknown>`, and `AsyncGenerator<unknown>`. `anti-slop/no-known-value-widening` uses the same check for the parameter of a type guard. A local declaration with the same name as a built-in type, such as `interface Promise<T>`, is not treated as the built-in type.
