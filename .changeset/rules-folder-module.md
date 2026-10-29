---
"adamantite": patch
---

Stop exporting the internal helpers `getRuleName`, `isRuleFile`, `listRuleFiles`, and
`DEFAULT_PLUGIN_NAME` from `adamantite/lint/custom`. They were never documented. The module still
exports `custom()` and `CustomRulesOptions`.
