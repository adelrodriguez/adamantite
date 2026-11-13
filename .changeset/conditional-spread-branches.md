---
"adamantite": minor
---

Report more conditional spreads that omit properties in `anti-slop/no-conditional-empty-object-spread`

The rule now reports `...(name && { name })`, a branch of `undefined`, `null`, or `void 0`, an empty object under `satisfies` or `as`, an empty branch in a nested conditional, and a `const` that holds `{}`. It also reports the same pattern in a JSX spread attribute, such as `<div {...(ok ? { title } : {})} />`. The message now says that one branch adds nothing, because that branch is not always an empty object.
