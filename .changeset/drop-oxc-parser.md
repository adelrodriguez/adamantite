---
"adamantite": patch
---

Drop the `oxc-parser` dependency

Adamantite now reads configs by loading them and reads disable comments and syntax trees from Oxlint, so it no longer installs `oxc-parser`. Its runtime dependencies are `effect`, `@effect/platform-node`, and `oxc-resolver`.
