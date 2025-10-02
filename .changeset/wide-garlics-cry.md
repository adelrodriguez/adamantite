---
"adamantite": patch
---

Update development dependencies and TypeScript peer dependency requirement

- Update tsdown from 0.15.2 to 0.15.6 for improved build performance and bug fixes
- Update type-fest from 5.0.0 to 5.0.1 for latest type utilities
- Update TypeScript from 5.9.2 to 5.9.3 for latest compiler improvements
- Update TypeScript peer dependency to >=5.6.0 (required for noUncheckedSideEffectImports compiler option)

This ensures compatibility with the TypeScript preset's `noUncheckedSideEffectImports` option which requires TypeScript 5.6 or higher.
