---
"adamantite": minor
---

Read named interfaces, heritage clauses, and finite key sets in the dictionary rules

`antislop/no-unsafe-dictionary-type` and `antislop/no-known-value-widening` now treat a named interface like a named alias, and a finite key set like a closed object.

`antislop/no-unsafe-dictionary-type`:

- Reports `interface A extends Record<string, unknown>`, `class A implements Record<string, unknown>`, and a type alias or interface whose default type argument makes it an unsafe dictionary, such as `type Bag<T = unknown> = Record<string, T>`.
- Reads `globalThis.Record<string, unknown>` as the built-in `Record`, which Effect code writes when `import { Record } from "effect"` hides the global type.
- Reads a named interface at a use with type arguments, as it reads an alias. `interface Bag<V> extends Record<string, V> {}` used as `Bag<unknown>` is reported, and `Bag<number>` is not. A plain use such as `const bag: Bag` is not reported again, because the interface declaration reports itself.
- Reports a named dictionary such as `type LogFields = Record<string, unknown>` once, at its declaration, also when another type alias uses it. Before, `type Logger = { info: (event: LogFields) => void }` got one report for each method. An alias whose whole body is the dictionary, such as `type Other = LogFields`, still reports, because it gives the dictionary another name. A logger or tracer that accepts open fields can name its field bag once and suppress the rule at that declaration with a reason, as the strict preset section of the README shows.
- No longer reports `Record<"a" | "b", unknown>` or a mapped type over literal keys, because `{ a: unknown; b: unknown }` passes. It still reports a key type that it cannot resolve, such as an imported type.
- No longer reports `Record<string, unknown>` in a conditional type test, such as `T extends Record<string, unknown> ? A : B`, or as the filter of the built-in `Extract` and `Exclude`. Those positions ask whether a type is a plain object, and `object` gives a different answer for interfaces and arrays.

`antislop/no-known-value-widening`:

- Reports a known value widened to a named interface with an index signature, such as `interface ScoreMap { [name: string]: number }`, as it does for `type Scores = Record<string, number>`. A generic interface passes its type arguments to the types it extends, so `interface Dict<K extends string, V> extends Record<K, V>` is open as `Dict<string, number>` and closed as `Dict<"a" | "b", number>`. The message now asks for a named owner contract with known keys.
- No longer calls an inline mapped type over literal keys, such as `{ [K in "a" | "b"]: number }`, an open dictionary.
- Reports a type guard or assertion call only when its argument is a literal or object value, such as `isString("known")`, or a `const` that holds one. TypeScript narrows a declared binding at the call, so a guard on a parameter typed `string | number` does not widen it.

Both rules read the keys of a mapped type with an `as` clause from that clause. `{ [K in "seed" as string]: unknown }` is still an open dictionary. ``{ [K in Kind as `get${Capitalize<K>}`]: number }`` is closed when `Kind` is a finite set of literals. Any other `as` clause, such as an imported type or a template with `string`, counts as open.
