---
"adamantite": minor
---

Read `globalThis` built-in types in `antislop/no-widen-then-assert` and `antislop/no-array-filter-map`

Both rules read a built-in type name only from a plain name. So `no-widen-then-assert` missed a binding widened to `globalThis.Record<string, unknown>` and asserted back, and `no-array-filter-map` and `no-reduce-accumulator-copy` did not count `globalThis.Array<T>` or `globalThis.ReadonlyArray<T>` as an array. Effect code writes these forms when `import { Array, Record } from "effect"` hides the global types. The rules now read `globalThis.X` as the built-in `X`. An assertion to `globalThis.Record<string, unknown>` is no longer called narrower, as with `Record<string, unknown>`.
