---
"adamantite": minor
---

Migrate lint presets from JSON to TypeScript config modules using oxlint's `defineConfig()`.

All lint presets (`core`, `react`, `nextjs`, `vue`, `node`, `jest`, `vitest`) are now `.ts` files exported via `adamantite/lint` and `adamantite/lint/*`. `adamantite init` generates `oxlint.config.ts` instead of `.oxlintrc.json`, and `adamantite update` automatically migrates legacy `.oxlintrc.json` files—preserving custom rules, existing preset references (both `node_modules` paths and package exports), and non-Adamantite extends entries—then removes the old JSON config.

When both `oxlint.config.ts` and `.oxlintrc.json` exist, Adamantite prefers the TypeScript config and warns about the duplicate.
