---
"adamantite": minor
---

Report more assertion chains, and name `@ts-expect-error` for test input, in the strict preset's assertion rules

- `antislop/no-widen-then-assert` reports an assertion of a widened binding anywhere after the declaration in the declaring function, including in the functions nested in it, such as a test callback inside `describe`. The binding is a `const` with no writes, so a nested function sees the same value.
- `antislop/no-chained-type-assertions` looks through a `satisfies` expression between two assertions, such as `(value as unknown satisfies unknown) as number`, as it looks through parentheses, because `satisfies` keeps the type of its operand.
- The messages of both rules now tell you to pass input of the wrong type without an assertion and put `// @ts-expect-error -- reason` above the call. A test that passes such input on purpose, such as `parsePort("abc" as unknown as number)`, had no form that both rules accept.
