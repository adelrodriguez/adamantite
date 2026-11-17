---
"adamantite": minor
---

Update Oxlint to 1.94 and `@effect/tsgo` to 0.70, and enable the two new Effect rules

The managed tooling versions are now Oxlint 1.94.0 and `@effect/tsgo` 0.70.0. `@effect/tsgo` 0.70.0 ships the Effect build of Oxlint 1.94.0 and keeps the build of tsrs 0.25.0-ts7.1.0-beta, so tsrs stays at that version.

The effect preset enables the two new `@effect/tsgo` rules:

- `effecttsgo/flat-map-provide-service-to-provide-service-effect` reports an `Effect.flatMap` whose callback only passes its parameter to `Effect.provideService`. `Effect.provideServiceEffect` replaces it.
- `effecttsgo/for-loop-push-to-for-each` reports a `for...of` loop in an Effect generator that only pushes `yield*` results into an array declared just before the loop. `Effect.forEach` replaces it.

To upgrade an existing project:

- Run `adamantite update` to install the new versions.
- In a project with the effect preset, expect `adamantite check` to report the code that the two new rules describe. Both rules come with a fix in the editor.
- Expect `adamantite fix` to apply fewer fixes. Oxlint 1.94 turns the fixes of several rules into suggested fixes, such as `no-useless-escape`, `no-regex-spaces`, `typescript/no-import-type-side-effects`, and the `prefer-to-be` and `prefer-called-with` rules of Jest and Vitest. Run `adamantite fix --suggested` to apply them, and review the changes.
