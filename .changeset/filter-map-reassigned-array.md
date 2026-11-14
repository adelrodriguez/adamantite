---
"adamantite": minor
---

Let `antislop/no-array-filter-map` report a reassigned variable with an array type

The strict preset now reports adjacent `filter` and `map` calls on a `let` variable that has an array type annotation, such as `let values: number[] = []`, also after the code assigns a new value to it. The annotation keeps each value an array. A reassigned variable without an annotation is still allowed, because its new value can be an iterator.
