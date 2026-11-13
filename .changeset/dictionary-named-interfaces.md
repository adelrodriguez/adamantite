---
"adamantite": minor
---

Treat a named interface like a named alias, and a finite key set like a closed object, in the dictionary rules

`anti-slop/no-known-value-widening` now reports a known value widened to a named interface with an index signature, such as `interface ScoreMap { [name: string]: number }`, as it already did for `type Scores = Record<string, number>`. A name does not close the keys, so both lose the keys the value had. The rule no longer calls an inline mapped type over literal keys, such as `{ [K in "a" | "b"]: number }`, an open dictionary. Its message now asks for a named owner contract with known keys.

`anti-slop/no-unsafe-dictionary-type` no longer reports `Record<"a" | "b", unknown>` or a mapped type over literal keys, because `{ a: unknown; b: unknown }` passes. It still reports a key type that it cannot resolve, such as an imported type.

Both rules read the keys of a mapped type with an `as` clause from that clause. `{ [K in "seed" as string]: unknown }` is still an open dictionary. ``{ [K in Kind as `get${Capitalize<K>}`]: number }`` is closed when `Kind` is a finite set of literals. Any other `as` clause, such as an imported type or a template with `string`, counts as open.
