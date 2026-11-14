---
"adamantite": patch
---

Allow `typeof` in the callbacks of a type guard in the strict preset

`antislop/no-runtime-typeof` allows `typeof` inside a type guard, but it stopped at the nearest function. It now also allows `typeof` in an inline callback of a type guard, such as `value.every((item) => typeof item === "string")`, and in an arrow function whose variable has a type guard type, such as `const isText: (value: unknown) => value is string = (value) => typeof value === "string"`. A callback with its own return type that is not a type predicate, and a helper function stored in a variable, are still reported.
