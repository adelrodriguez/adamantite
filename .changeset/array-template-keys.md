---
"adamantite": minor
---

Read template literal method keys in `anti-slop/no-array-filter-map` and `anti-slop/no-reduce-accumulator-copy`

Both rules read a method name from `items.filter` or `items["filter"]`, but not from a template literal with no expressions, such as ``items[`filter`](f)[`map`](g)`` or ``rows[`reduce`](...)``. They now read the key the same way as `anti-slop/no-reflect-get` and `anti-slop/no-reflect-apply`. A template literal with an expression, such as ``items[`${method}`]``, still does not count as a method name.
