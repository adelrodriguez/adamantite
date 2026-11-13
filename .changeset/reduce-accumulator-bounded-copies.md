---
"adamantite": patch
---

Let `anti-slop/no-reduce-accumulator-copy` accept copies with a fixed size, and give advice that passes the core preset

The rule no longer reports a copy that cannot grow: a sliding window such as `acc.slice(-2).concat(item)`, a `with`, `toSorted`, or `toReversed` copy of a non-empty tuple that the step returns, and an `Object.assign({}, acc, { sum: acc.sum + n })` copy with fixed keys on a non-empty initial value. The message used to ask for a mutated accumulator, which the core preset's `no-param-reassign` reports for `acc[key] = value`. It now names `Object.assign(acc, source)`, `acc.push(item)`, `Map#set`, and `Object.fromEntries`, which pass both presets.
