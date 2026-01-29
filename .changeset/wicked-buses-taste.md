---
"adamantite": minor
---

Replace tsgo with standard TypeScript compiler (tsc) for type checking

The `typecheck` command now uses `tsc` instead of the experimental `@typescript/native-preview` (tsgo). This provides better stability and compatibility since tsgo is still in development. Commands no longer require package manager detection to run - they execute tools directly.
