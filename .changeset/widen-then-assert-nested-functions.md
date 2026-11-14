---
"adamantite": minor
---

Report assertions in nested functions in `antislop/no-widen-then-assert`

The rule used to report an assertion of a widened binding only in the function that declares the binding. An assertion in a test callback inside `describe`, or in a function that reads a module binding, was not reported. The binding is a `const` with no writes, so a nested function sees the same value. The rule now reports an assertion anywhere after the declaration in the declaring function, including in the functions nested in it.
