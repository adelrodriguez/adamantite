---
"adamantite": minor
---

Add the `adamantite/lint/strict` preset for framework-neutral opinions

The preset enables `adamantite/no-overzealous-destructuring`. The rule reports destructuring patterns nested more than 2 levels deep, such as `const { data: { user: { name } } } = query`, and object patterns that take more than 5 properties. A rest element does not count as a property. It checks declarations, parameters, assignments, `for...of` heads, and `catch` clauses. Each message tells what to do instead: keep the object and read its members, or split the pattern. Set the rule's `maxDepth` and `maxProperties` options to change the limits.

The preset also sets `typescript/consistent-type-assertions` to ban type assertions. `as const` stays allowed, and test files keep the core preset's setting.

Select the preset in `adamantite init` or with `--preset strict`. It uses Adamantite's own Oxlint plugin, so it needs no extra dependency.
