---
"adamantite": minor
---

Add Astro formatting to the Zed preset and migrate stale Zed oxfmt settings

The Zed preset now formats `.astro` files through Zed's managed Prettier with `prettier-plugin-astro` (oxfmt cannot format Astro), mirroring Zed's shipped defaults, and explicitly disables Prettier for the languages oxfmt owns so the two formatters never compete. A new migration removes settings the old Zed preset wrote under the oxfmt language server that the formatter never reads (`configPath`, `typeAware`, `unusedDisableDirectives`, and the deprecated `fmt.experimental`); only exact value matches are removed, so user-edited values survive.
