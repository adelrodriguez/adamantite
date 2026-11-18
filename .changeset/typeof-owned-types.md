---
"adamantite": minor
---

Allow `typeof` on a value with a declared owned type in `quality/no-runtime-typeof`

The rule now reports `typeof` only on values that may be unparsed. It allows `typeof` on a variable, a parameter, or a property path such as `options.headers` or `options!.headers`, when the root binding has a type annotation with no `unknown` or `any`, as in `retry: number | RetryPolicy`. It also allows a property destructured from such a binding, as in `const { headers } = options`.

- The rule resolves local aliases, generic aliases, and aliases of type parameters before it checks the type. A local alias that hides `unknown` or `any`, such as `type Payload = Record<string, unknown>`, does not count as owned, and a local alias of an owned union, such as `type Label = string | (() => string)`, does. An imported alias has no body in the file, so the rule treats it as owned.
- A type parameter counts as owned only with an owned constraint, as in `<T extends string | number>`. The rule reports `typeof` on a type parameter with no constraint, or with a constraint that has `unknown` or `any`, as in `<T extends Record<string, unknown>>`, also behind `NonNullable`, `NoInfer`, or `Awaited`, or in an intersection with `{}` or `object`. A nearer type alias or interface with the same name hides an outer type parameter, and the rule then checks that declaration.
- The rule allows `typeof` inside a type guard, also in an inline callback of the guard, such as `value.every((item) => typeof item === "string")`, and in an arrow function whose variable has a type guard type, such as `const isText: (value: unknown) => value is string = (value) => typeof value === "string"`.

The rule still reports a value typed `unknown` or `any`, an unannotated value, the result of `JSON.parse`, a callback with its own return type that is not a type predicate, and a helper function stored in a variable.
