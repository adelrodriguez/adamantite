---
"adamantite": minor
---

Replace Biome with oxlint and oxfmt for linting and formatting

**Breaking changes:**

- `biome.jsonc` is no longer supported - use `.oxlintrc.json` and `.oxfmtrc.jsonc` instead
- Configuration now extends `adamantite/lint` (oxlint) and uses oxfmt for formatting
- Biome must be uninstalled - `oxlint` and `oxfmt` are the new peer dependencies
- CLI commands (`check`, `fix`, `format`) now use oxlint/oxfmt instead of Biome

**New features:**

- Modular oxlint presets: `core`, `react`, and `next` configurations
- 500+ linting rules (up from 200+ with Biome)
- 10-40x faster linting performance
- Separate formatting configuration via oxfmt

Run `adamantite update` to migrate existing projects automatically.
