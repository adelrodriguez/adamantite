---
"adamantite": patch
---

Name `@ts-expect-error` in the messages of `anti-slop/no-chained-type-assertions` and `anti-slop/no-widen-then-assert`

A test that passes input of the wrong type on purpose, such as `parsePort("abc" as unknown as number)`, had no form that both rules accept. The messages now tell you to pass the input without an assertion and put `// @ts-expect-error -- reason` above the call. The rules report the same code as before.
