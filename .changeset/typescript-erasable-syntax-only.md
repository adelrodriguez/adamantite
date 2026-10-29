---
"adamantite": minor
---

The `adamantite/typescript` preset sets `erasableSyntaxOnly`, so TypeScript reports `enum`, a
`namespace` with values, parameter properties, and `import x = require()`. Node.js type stripping
and Bun run only erasable syntax, so TypeScript now reports this syntax before a run fails. This can break an existing project: a project
that uses this syntax fails type checking after the update. Rewrite the code, for example an
`enum` as an `as const` object, or set `"erasableSyntaxOnly": false` in the project's own
`tsconfig.json`.
