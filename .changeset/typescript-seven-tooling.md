---
"adamantite": minor
---

Upgrade consumer type-aware linting to TypeScript 7.0.2 semantics, including hard errors for TypeScript 6 deprecations and TypeScript 7 compiler defaults. Ambient `@types/*` packages are no longer discovered automatically and must be listed explicitly when needed. Require TypeScript `>=7` as a peer dependency, replace the native preview with `typescript@7.0.2`, and update Oxlint to 1.75.0, oxlint-tsgolint to 7.0.2001, and Oxfmt to 0.60.0.
