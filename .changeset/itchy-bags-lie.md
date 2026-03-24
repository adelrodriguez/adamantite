---
"adamantite": minor
---

Migrate format and Knip presets from JSON to TypeScript with full type safety

Both `adamantite/format` and `adamantite/analyze` exports now resolve to typed TypeScript modules instead of JSON files. New projects get `oxfmt.config.ts` and `knip.config.ts` that import and spread the presets, making it easy to override individual options with autocomplete.

**Breaking:** Existing JSON-based configs are now legacy formats:

- `.oxfmtrc.json` / `.oxfmtrc.jsonc` → `oxfmt.config.ts`
- `knip.json` / `knip.jsonc` → `knip.config.ts`

Run `adamantite update` to migrate automatically. The migration preserves custom overrides and removes the old files.
