---
"adamantite": patch
---

Fix package exports to point to built artifacts instead of raw TypeScript source

Package exports were incorrectly pointing to raw `.ts` source files, which required consumers to have a TypeScript-aware bundler. Exports now correctly resolve to compiled `.js` and copied `.json` files in `dist/`.
