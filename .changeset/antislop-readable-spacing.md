---
"adamantite": minor
---

Update the vendored anti-slop rules, and enable 3 new rules in the antislop preset

The `antislop` preset now ships anti-slop at commit `13909c9` and enables these new rules:

- `no-array-filter-map` reports a `filter` and a `map` chained on one array, which walk the array twice. Use a single `flatMap`, or `.values().filter().map().toArray()` where the runtime supports iterator helpers.
- `no-reduce-accumulator-copy` reports a `reduce` callback that copies its accumulator on each step with `Object.assign`, `Array.from`, `concat`, or another array copy method. Mutate an accumulator that the callback owns and return it.
- `require-readable-spacing` requires a blank line around multi-line statements, declarations, and blocks, and before `return`, `if`, and loop statements. Consecutive single-line bindings stay together. The rule has an autofix that only adds blank lines.

To upgrade an existing project:

- Run `adamantite update` to install the new version.
- Run `adamantite fix` to add the blank lines that `require-readable-spacing` reports.
- Expect `adamantite check` to report the code that the other two rules describe.
