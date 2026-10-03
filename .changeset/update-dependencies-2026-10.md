---
"adamantite": patch
---

Update the managed tooling versions: Oxlint 1.86.0, Oxfmt 0.71.0, oxlint-tsgolint 7.0.2003, Knip 6.39.0, and `@shadcn/lint` 0.2.0. `adamantite update` installs these versions, and doctor reports a version mismatch for older pins. Also update the runtime dependencies `@clack/prompts` 1.8.1, `nypm` 0.6.10, and `oxc-parser` 0.152.0.

The core lint preset now enables `typescript/no-generated-empty-object-type`. This type-aware rule reports utility types and intersections that resolve to the empty object type `{}`, such as `Omit<{ a: string }, "a">`. It adds to `typescript/no-empty-object-type`, which reports only a `{}` that you write.
