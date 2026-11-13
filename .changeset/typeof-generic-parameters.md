---
"adamantite": minor
---

Report `typeof` on an unconstrained generic value in the strict preset

`anti-slop/no-runtime-typeof` allows `typeof` on a value with a declared owned type. It read a type parameter, as in `function describe<T>(value: T)`, as an owned type, but `T` can be any value. It now reports `typeof` when the declared type is a type parameter with no constraint, or with a constraint that has `unknown` or `any`, as in `<T extends Record<string, unknown>>`. It also reports such a type parameter behind `NonNullable`, `NoInfer`, or `Awaited`, or in an intersection with `{}` or `object`. A type parameter with an owned constraint, as in `<T extends string | number>`, is still allowed.

A nearer type alias or interface with the same name hides an outer type parameter, as `type T = string | number` inside a function nested in `function outer<T>()`. The rule then checks that declaration instead of the type parameter.
