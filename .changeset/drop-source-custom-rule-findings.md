---
"adamantite": patch
---

Stop reporting the custom rule findings that read source code in Doctor

Doctor no longer reports these findings:

- "Custom rules need migration to the current agent workflow" (`custom-rules-api-migration`)
- "Custom rule `<file>` cannot load" (`custom-rule-cannot-load:<file>`)

Doctor read the source of the Oxlint configs and the rule files for them. A config or a rule file that imports the removed `adamantite/lint/custom` module, or a name that `adamantite/rules` no longer exports, fails to load, and so does a rule file with TypeScript that type stripping cannot erase, such as an `enum`. Doctor reports each of them as the `oxlint-config-load-failure` finding, with the error that Oxlint printed, which names the rule file and the reason. Import `custom` from `adamantite/rules`, and `definePlugin`, `defineRule`, and the authoring types from `adamantite/rules/plugin`. The Adamantite skill now gives these repairs for the `oxlint-config-load-failure` finding.
