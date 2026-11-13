---
"adamantite": patch
---

Stop reporting type guard calls on declared bindings in `anti-slop/no-known-value-widening`

TypeScript narrows a value at a type guard or assertion call, so a guard on a parameter typed `string | number` or `string | undefined` does not widen it. The rule now reports a guard call only when its argument is a literal or object value, such as `isString("known")`, or a `const` that holds one.
