---
"adamantite": minor
---

Restructure Biome configuration to use extends pattern and move presets to src directory

**Breaking Changes:**

The package structure has been reorganized to consolidate presets in the `src/presets` directory and adopt a more maintainable configuration pattern:

- **Biome configuration**: The root `biome.jsonc` now extends from `src/presets/biome.jsonc` instead of containing the full configuration inline
- **TypeScript preset**: Moved from `presets/tsconfig.json` to `src/presets/tsconfig.json` for consistency
- **Package exports**: Added clean export paths via package.json exports field:
  - `adamantite` → Biome configuration (default export)
  - `adamantite/biome` → Biome configuration (explicit)
  - `adamantite/tsconfig` → TypeScript configuration (new clean path)
  - `adamantite/presets/*` → Direct preset access (fallback)
- **Schema references**: Updated to use local Biome schema paths (`./node_modules/@biomejs/biome/configuration_schema.json`) instead of remote URLs
- **TypeScript preset**: Removed `verbatimModuleSyntax` setting to improve compatibility with both ESM and CommonJS projects

**Migration:**

If you're importing Adamantite's Biome configuration:

- Update imports from `adamantite/biome.jsonc` to `adamantite` (the package main export)
- If extending the TypeScript preset, update the path from `adamantite/presets/tsconfig.json` to `adamantite/tsconfig`
- If your project relies on `verbatimModuleSyntax`, add it to your local tsconfig.json as it's no longer included in the preset

**Internal improvements:**

- Tests now validate local schema paths instead of remote URL formats, improving offline development experience
- Configuration structure better aligns with modern preset patterns using `extends`
