---
"adamantite": minor
---

Let `antislop/no-reduce-accumulator-copy` report copies in named reducers and other indirect copies

The strict preset now reports an accumulator copy in a function declaration or a `const` function that a `reduce` call in the same file uses as its reducer, such as `items.reduce(append, [])`. It also reports an accumulator passed to `concat` on a new array, such as `[item].concat(acc)`, `globalThis.Object.assign` and `globalThis.Array.from`, and a copy in a callback that the reducer passes to another call, such as `forEach`. A copy with a fixed size and a copy in a stored callback are still allowed.
