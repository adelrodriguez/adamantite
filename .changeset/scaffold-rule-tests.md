---
"adamantite": minor
---

Add `adamantite/rules/testing` for temporary agent verification

Agents use `RuleTester` with valid and invalid cases from stdin or a temporary file while they
write or harden custom rules. They remove the verification cases and fixtures before handback.
By default, the target project keeps only the rules, their runtime helpers, and the required config.
`RuleTester` connects to `node:test`, so a failed case makes the verification command fail,
also in a Bun project that runs the command with Node.js. `oxlint` is an optional peer dependency.

`rule add` writes only a rule stub. Users can opt in with `adamantite rule add test [name]`.
Without a name, it lists existing rules for selection. A named rule must already exist.
The command writes `<name>.test.ts` beside the rule; `--path <file>` chooses another test path.
Run saved tests explicitly with `adamantite rule test`, or give it `--path` for a test saved
elsewhere. The plugin loader and Doctor do not treat `.test.*` files as rules.
Saved tests use `node:test`; exclude them from Vitest/Jest discovery. The command and
README explain that setup. The template accepts the shipped lint presets for both runners.

Automatic test scaffolding, CI test steps, and post-handoff test runs are removed.
Doctor preserves user-owned tests and optional CI steps. Init keeps an existing workflow
that explicitly runs `rule test`, including its setup and other settings.
