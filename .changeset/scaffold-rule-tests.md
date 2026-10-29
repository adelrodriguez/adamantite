---
"adamantite": minor
---

`adamantite rule add <name>` now also writes `tests/<name>.ts` in the rules folder: a `RuleTester` test with one valid case and one invalid case. A new command, `adamantite rule test`, runs the tests of every rules folder that a `custom()` call loads with `node --test`, and exits with its exit code. The tests run under Node.js in every project, Bun projects too, and the project's own Vitest or Jest run does not find them. `adamantite check` does not run them.

Add `adamantite/rules/testing`, which exports `RuleTester` connected to `node:test`, so a rule test has one import and each case reports by name. `oxlint` is now an optional peer dependency.

When the rule or its test exists, `rule add` writes nothing, and the error names each file that exists. The rule stub sorts its keys, so `adamantite check` accepts it without `fix`. The "Custom rules" section of the Adamantite skill now teaches `rule test`, how to put the logic of a rule in a `_<name>.ts` helper and test it directly, how to write a message that says what to do instead, and when a rule earns its place.
