# The TypeScript preset allows only erasable syntax

v1 and 100times both set `erasableSyntaxOnly` on top of `adamantite/typescript`, and the rule
files in `.adamantite/rules` already need erasable syntax, because Oxlint loads them with
Node.js type stripping. We decided (2026-10-29, issue #545) that the `adamantite/typescript`
preset sets `erasableSyntaxOnly`.

The option makes TypeScript report each syntax that has a runtime effect: `enum`, a `namespace`
with values, parameter properties, and `import x = require()`. Node.js type stripping and Bun
run only erasable syntax, so the option removes one cause of a failed run without a build step.
It is not a full check of runtime compatibility: a type imported without `type`, such as
`import { Shape } from "./types.ts"` for an interface, still type checks and still fails under
Node.js type stripping. The core
lint preset already reports namespaces (`typescript/no-namespace`) and parameter properties
(`typescript/parameter-properties`), but no lint rule bans `enum`. A type-level ban is the top of
the enforcement ladder: the editor shows it, and no suppression comment turns it off file by file.

## Considered options

- **A lint rule that bans `enum`.** Oxlint has no native rule for it, so the ban needs a JS
  plugin rule, which core does not load (ADR 0010). It also covers less than the compiler option.
- **Keep the option in each project.** This is the duplication that issue #524 removes.

## Consequences

- A project that extends `adamantite/typescript` and uses `enum`, a `namespace` with values,
  parameter properties, or `import x = require()` fails type checking after the update. It can
  rewrite the code, or set `"erasableSyntaxOnly": false` in its own `tsconfig.json`.
- v1 and 100times can remove their own `erasableSyntaxOnly` setting.
