---
"adamantite": patch
---

Drop the `adamantite/tsconfig` options that TypeScript 7 already sets by default

The preset no longer lists `strict`, `noImplicitAny`, `noImplicitThis`, `esModuleInterop`, `forceConsistentCasingInFileNames`, or `noUncheckedSideEffectImports`. TypeScript 7 turns each of them on by default, so a project that extends the preset type-checks the same way.
