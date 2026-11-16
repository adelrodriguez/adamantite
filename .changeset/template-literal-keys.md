---
"adamantite": minor
---

Read template literal keys and `globalThis` built-in types in the Adamantite rules

The rules of the `adamantite`, `antislop`, and `antislop-effect` plugins now read property keys with one shared helper, so a key form that one plugin reads, the others read too. A template literal with an expression, such as ``items[`${method}`]``, still does not count as a key.

- The rules that find calls of imported functions, such as `adamantite/no-react-state-hooks`, report ``React[`useState`](0)``.
- `antislop/no-array-filter-map` and `antislop/no-reduce-accumulator-copy` read a method name from a template literal, such as ``items[`filter`](f)[`map`](g)`` or ``rows[`reduce`](...)``, as `antislop/no-reflect-get` and `antislop/no-reflect-apply` do.
- The `antislop-effect` tag rules report ``value[`_tag`] === "Ready"`` and ``{ [`_tag`]: "Ready" }``, classify ``error[`reason`][`_tag`]`` as a reason tag, and accept the pattern object of ``Match[`when`](...)``.
- `adamantite/no-query-data-in-state` reads ``query[`data`]`` and `{ ["data"]: user }`.
- In `antislop/no-unknown-parameters`, a parser, promise, or `cause` name written as a string or template key, such as `schema["parse"](value)`, gets the same exemption as the plain name.

The rules also read `globalThis.X` as the built-in `X`, which Effect code writes when `import { Array, Record } from "effect"` hides the global types. `antislop/no-widen-then-assert` reports a binding widened to `globalThis.Record<string, unknown>` and asserted back, and no longer calls an assertion to `globalThis.Record<string, unknown>` narrower. `antislop/no-array-filter-map` and `antislop/no-reduce-accumulator-copy` count `globalThis.Array<T>` and `globalThis.ReadonlyArray<T>` as arrays.
