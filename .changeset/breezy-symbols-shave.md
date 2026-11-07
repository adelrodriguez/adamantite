---
"adamantite": minor
---

Add `adamantite/lint/architecture` to load first-party rules without the other rules of `strict`.

The preset enables no rules by default. Configure `adamantite/layers` with your layer maps and
`adamantite/import-owners` with your import owners. Select it with `init --preset architecture`
or add it to the `extends` array of your Oxlint config. Existing `strict` configurations keep
their behavior.
