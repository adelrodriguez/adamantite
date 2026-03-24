---
"adamantite": minor
---

Convert the format preset from JSON to a typed module export and make `oxfmt.config.ts` the canonical managed formatter config.

The `adamantite/format` export now resolves to a module instead of a JSON file. New projects get an `oxfmt.config.ts` that imports `format` from `"adamantite/format"` and wraps it with `defineConfig(...)`.

**Breaking:** Existing `.oxfmtrc.json` and `.oxfmtrc.jsonc` configs are now legacy formats. Run `adamantite update` to migrate them to `oxfmt.config.ts`; Adamantite preserves custom overrides and removes the old file.
