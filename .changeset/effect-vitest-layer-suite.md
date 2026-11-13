---
"adamantite": patch
---

Accept a `layer` suite of `@effect/vitest` in the vitest preset

`vitest/require-hook` reported `layer(TestLayer)("name", (it) => ...)` as setup code outside a hook. The vitest preset now sets `allowedFunctionCalls: ["layer"]` on the rule, so a `layer` suite passes as a `describe` suite does. The rule matches the name of the call, not the import. So in a project without Effect, a top-level call of a function named `layer` also passes. The rule still reports a top-level call of another function.
