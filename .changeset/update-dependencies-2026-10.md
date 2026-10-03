---
"adamantite": minor
---

Update the managed tooling and report utility types that resolve to `{}`

The core lint preset now enables `typescript/no-generated-empty-object-type`. This type-aware rule reports utility types and intersections that resolve to the empty object type `{}`, such as `Omit<{ a: string }, "a">`. It adds to `typescript/no-empty-object-type`, which reports only a `{}` that you write.

Update the managed tooling versions: Oxlint 1.86.0, Oxfmt 0.71.0, oxlint-tsgolint 7.0.2003, Knip 6.39.0, and `@shadcn/lint` 0.2.0. Also update the runtime dependencies `@clack/prompts` 1.8.1, `nypm` 0.6.10, and `oxc-parser` 0.152.0.

To upgrade an existing project:

- Run `adamantite update` before you lint. Oxlint 1.83.0, which earlier Adamantite releases install, does not know the new rule and stops with `Rule 'no-generated-empty-object-type' not found in plugin 'typescript'`. `adamantite doctor` reports a version mismatch for older pins.
- Expect `adamantite check` to fail on existing utility types that resolve to `{}`. Replace each one with the type that you intend, such as `Record<string, never>` for an object with no properties.
