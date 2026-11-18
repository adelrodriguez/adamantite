---
"adamantite": minor
---

Report accumulator copies in named reducers, and accept copies with a fixed size, in `quality/no-reduce-accumulator-copy`

The rule now reports an accumulator copy in a function declaration or a `const` function that a `reduce` call in the same file uses as its reducer, such as `items.reduce(append, [])`. It also reports an accumulator passed to `concat` on a new array, such as `[item].concat(acc)`, `globalThis.Object.assign` and `globalThis.Array.from`, and a copy in a callback that the reducer passes to another call, such as `forEach`. A copy in a stored callback is still allowed.

The rule no longer reports a copy that cannot grow: a sliding window such as `acc.slice(-2).concat(item)`, a `with`, `toSorted`, or `toReversed` copy of a non-empty tuple that the step returns, and an `Object.assign({}, acc, { sum: acc.sum + n })` copy with fixed keys on a non-empty initial value. A step that also uses the accumulator outside the copy that it returns, as in `acc.push(item)`, is still reported, because it can grow the accumulator first.

The message used to ask for a mutated accumulator, which the core preset's `no-param-reassign` reports for `acc[key] = value`. It now names `Object.assign(acc, source)`, `acc.push(item)`, `Map#set`, and `Object.fromEntries`, which pass both presets.
