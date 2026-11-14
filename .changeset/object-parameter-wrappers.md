---
"adamantite": minor
---

Report `Readonly<object>` and `object & {}` parameters in `antislop/no-object-parameters`

The rule now reports a parameter typed `Readonly<object>`, `NonNullable<object>`, or an intersection of `object` with `{}`, because each type accepts the same values as `object`. A local type named `Readonly` or `NonNullable` keeps its own meaning, and an intersection with a named type, such as `object & Owner`, still passes.
