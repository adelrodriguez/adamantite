---
"adamantite": minor
---

Update tsrs to 7.1.0-beta.tsrs4 and `@effect/tsgo` to 0.73.4, report promise unions in conditions, and enable the three new Effect rules

The managed tooling versions are now tsrs 7.1.0-beta.tsrs4 and `@effect/tsgo` 0.73.4. `@effect/tsgo` 0.73.4 ships the Effect build of tsrs 7.1.0-beta.tsrs4 and no longer ships one of tsrs 0.25.0-ts7.1.0-beta, so the two versions move together. tsrs now names its versions after the TypeScript version that it ports, with a `tsrs` revision, and runs in its fast mode by default.

The optional peer ranges move to `oxlint` 1.94.0 or later and `tsrs` 7.1.0-beta.tsrs4 or later. Oxlint 1.93 and earlier reject the new `no-misused-promises` option. Every tsrs release is a semver prerelease, and npm matches a prerelease only against a range that names a prerelease of the same major, minor, and patch. The `tsrs` range therefore accepts the later revisions for TypeScript 7.1.0, such as 7.1.0-beta.tsrs5 and 7.1.0-tsrs1, and must move when tsrs ports a newer TypeScript version. It rejects 7.1.0-beta.tsrs10, because semver sorts `tsrs10` before `tsrs4`, and tsrs plans to port a newer TypeScript version before a tenth revision.

The type check of `adamantite check` now reports compiler errors only in the files that Oxlint lints. A type error in a file that `ignorePatterns` skips, such as the generated code that the core ignore patterns cover, no longer fails the check. A file that `tsconfig.json` excludes still gets type errors when Oxlint lints it, and an invalid compiler option still fails the check.

The core preset sets `checksConditionals: { flagUnions: "strict" }` on `typescript/no-misused-promises`. The rule now also reports a condition on a union of a promise and its awaited type, such as `Promise<number> | number`. A promise is always truthy, so the condition ignores the number that the promise resolves to. It still accepts an optional promise in a condition, such as `if (pending) await pending`.

The effect preset enables the three new `@effect/tsgo` rules:

- `effecttsgo/promise-all-in-effect` reports `Promise.all` or `Promise.allSettled` over an array inside Effect code. `Effect.forEach` or `Effect.all` with a `concurrency` option replaces it.
- `effecttsgo/promise-race-in-effect` reports `Promise.race` or `Promise.any` inside Effect code, which leaves the losing promises running.
- `effecttsgo/flat-map-map-to-zip-with` reports an `Effect.flatMap` that only maps an independent effect with its parameter. `Effect.zipWith` replaces it.

To upgrade an existing project:

- Run `adamantite update` to install the new versions.
- Expect `adamantite check` to report the conditions and the Effect code that the new options and rules describe.
