---
"adamantite": minor
---

Resolve local type aliases in `antislop/no-runtime-typeof`

The rule allows `typeof` on a value with a declared type that has no `unknown` or `any`. It read only the written annotation, so a local alias that hides `unknown` or `any`, such as `type Payload = Record<string, unknown>` with `payload: Payload`, counted as an owned type. The rule now resolves local aliases, generic aliases, and aliases of type parameters before it checks the type, as the other `unknown` rules do. A local alias of an owned union, such as `type Label = string | (() => string)`, still allows `typeof`. An imported alias has no body in the file, so the rule still treats it as owned.
