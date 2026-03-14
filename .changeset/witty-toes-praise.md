---
"adamantite": patch
---

Adamantite lint presets no longer ship built-in `ignorePatterns` defaults.

Projects that still need ignores like `dist`, `.next`, or `node_modules` should define them in their local `oxlint.config.ts`.
