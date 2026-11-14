---
"adamantite": patch
---

Allow `typeof` on a value with a declared owned type in the strict preset

`antislop/no-runtime-typeof` now reports `typeof` only on values that may be unparsed. It allows `typeof` on a variable, a parameter, or a property path such as `options.headers` or `options!.headers`, when the root binding has a type annotation with no `unknown` or `any`, as in `retry: number | RetryPolicy`. It also allows a property destructured from such a binding, as in `const { headers } = options`. A value typed `unknown` or `any`, an unannotated value, and the result of `JSON.parse` are still reported.
