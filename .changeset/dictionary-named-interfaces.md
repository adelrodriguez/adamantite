---
"adamantite": minor
---

Treat a named interface like a named alias, and a finite key set like a closed object, in the dictionary rules

`anti-slop/no-known-value-widening` now reports a known value widened to a named interface with an index signature, such as `interface ScoreMap { [name: string]: number }`, as it already did for `type Scores = Record<string, number>`. A name does not close the keys, so both lose the keys the value had. The rule no longer calls an inline mapped type over literal keys, such as `{ [K in "a" | "b"]: number }`, an open dictionary. Its message now asks for a named owner contract with known keys.

`anti-slop/no-unsafe-dictionary-type` no longer reports `Record<"a" | "b", unknown>` or a mapped type over literal keys, because `{ a: unknown; b: unknown }` passes. It still reports a key type that it cannot resolve, such as an imported type.
