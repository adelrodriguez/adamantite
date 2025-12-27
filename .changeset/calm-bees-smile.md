---
"adamantite": minor
---

Add tsgo (TypeScript Go) as type checker

The `typecheck` command now uses `tsgo` instead of `tsc` for faster type checking. During initialization, `@typescript/native-preview` is installed instead of `typescript`.
