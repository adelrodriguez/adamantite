---
"adamantite": minor
---

Add `adamantite/rules/plugin` for the Oxlint authoring API and use `.adamantite/lint` as the default rules folder

Import `definePlugin`, `defineRule`, `eslintCompatPlugin`, and the Oxlint authoring types from
`adamantite/rules/plugin`. Import the rules-folder preset as `import custom from "adamantite/rules"`.
The helpers come from Adamantite's pinned `@oxlint/plugins` dependency. `RuleTester` stays at
`adamantite/rules/testing`, which also exports the upstream test types. Agents use temporary cases by default and discard those cases before handback. Users can opt in to saved tests with `adamantite rule test`.

Move an existing `.adamantite/rules` folder to `.adamantite/lint`, or keep it with
`custom({ dir: ".adamantite/rules" })` and `rule add --dir .adamantite/rules`. For a folder at
another path, set its `oxlint.entry` patterns in the Knip config.

The old named authoring imports from `adamantite/rules` and the `adamantite/lint/custom`
import are removed. Run `adamantite doctor` for migration instructions. It reports old
imports and default folders without changing files. The instructions preserve rule behavior,
plugin names, severity, and options.
