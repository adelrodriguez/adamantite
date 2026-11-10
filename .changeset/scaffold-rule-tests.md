---
"adamantite": minor
---

Add `RuleTester` at `adamantite/rules/testing`, and `adamantite rule test` to run saved rule tests

`RuleTester` runs valid and invalid cases against a custom rule. It connects to `node:test`, so a failed case makes the test command fail, also in a Bun project that runs the command with Node.js. `oxlint` is an optional peer dependency. Coding agents use `RuleTester` with temporary cases from stdin or a temporary file while they write custom rules, and remove the cases and fixtures before handback. The project keeps only the rules, their runtime helpers, and the required config.

To keep a test, run `adamantite rule test add [name]`. Without a name, it lists the existing rules to select from. A named rule must already exist. The command writes `<name>.test.ts` beside the rule, and `--path <file>` chooses another test path. Run saved tests with `adamantite rule test`, or give it `--path` for a test saved elsewhere. The plugin loader and Doctor do not treat `.test.*` files as rules.

Saved tests use `node:test`, so exclude them from Vitest and Jest discovery. The command and the README explain that setup. The test template passes the shipped lint presets for both test runners.
