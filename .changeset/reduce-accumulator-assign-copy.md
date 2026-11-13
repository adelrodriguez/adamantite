---
"adamantite": patch
---

Accept an `Object.assign({}, acc, …)` copy of a `reduce` accumulator in the core preset

The core lint preset no longer enables `prefer-object-spread`. The rule reported `Object.assign({}, acc, { sum: acc.sum + item.n })` in a `reduce` callback, and its fix wrote `{ ...acc, sum: acc.sum + item.n }`, which `oxc/no-accumulating-spread` reports. No immutable copy of an accumulator passed core. The `Object.assign` copy now passes core, and the strict preset still reports it when the accumulator can grow. Suppressions that name `prefer-object-spread` are now unused, so you can delete them.
