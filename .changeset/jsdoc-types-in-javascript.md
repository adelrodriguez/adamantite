---
"adamantite": patch
---

Accept JSDoc type tags in JavaScript files in the core preset

The core lint preset sets `jsdoc/check-tag-names` to `typed: true`, which reports a tag such as `@type`, because TypeScript syntax states the type. A JavaScript file has no type syntax, so the preset now sets `typed: false` for `.js`, `.jsx`, `.mjs`, and `.cjs` files.
