---
"adamantite": minor
---

Report `Readonly<object>` and `object & {}` parameters, and name the fixes that work, in `antislop/no-object-parameters`

The rule now reports a parameter typed `Readonly<object>`, `NonNullable<object>`, or an intersection of `object` with `{}`, because each type accepts the same values as `object`. A local type named `Readonly` or `NonNullable` keeps its own meaning, and an intersection with a named type, such as `object & Owner`, still passes.

The message now suggests a named domain type, `WeakKey` for a `WeakMap` or `WeakSet` key, or a generic `<T extends object>` that the signature uses again, such as in the return type. A generic with one use fails the core preset's `typescript/no-unnecessary-type-parameters`.
