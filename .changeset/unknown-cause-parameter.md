---
"adamantite": minor
---

Allow an `unknown` parameter named `cause` only for errors in the strict preset

`antislop/no-unknown-parameters` allowed every `unknown` parameter named `cause`, so `function parse(cause: unknown)` passed. It now allows `cause` only on a constructor, as in `constructor(message: string, cause: unknown)`, and on a function, method, class, or interface whose name ends in `Error` or has the word `cause`, as in `toError`, `AppError`, or `formatCauseDetail`. A `cause` property in an object type, as in `options: { cause: unknown }`, is still allowed.
