---
"adamantite": minor
---

Update tsrs to 7.1.0-beta.tsrs4 and `@effect/tsgo` to 0.73.4, report promise unions in conditions, and enable two new Effect rules

The managed tooling versions are now tsrs 7.1.0-beta.tsrs4 and `@effect/tsgo` 0.73.4. `@effect/tsgo` 0.73.4 ships the Effect build of tsrs 7.1.0-beta.tsrs4 and no longer ships one of tsrs 0.25.0-ts7.1.0-beta, so the two versions move together. tsrs now names its versions after the TypeScript version that it ports, with a `tsrs` revision, and runs in its fast mode by default.

The optional peer ranges move to `oxlint` 1.94.0 or later and `tsrs` 7.1.0-beta.tsrs4 or later. Oxlint 1.93 and earlier reject the new `no-misused-promises` option. Every tsrs release is a semver prerelease, and npm matches a prerelease only against a range that names a prerelease of the same major, minor, and patch. The `tsrs` range therefore accepts the later revisions for TypeScript 7.1.0, such as 7.1.0-beta.tsrs5 and 7.1.0-tsrs1, and must move when tsrs ports a newer TypeScript version. It rejects 7.1.0-beta.tsrs10, because semver sorts `tsrs10` before `tsrs4`, and tsrs plans to port a newer TypeScript version before a tenth revision.

The type check of `adamantite check` now reports compiler errors only in the files that Oxlint lints. A type error in a file that `ignorePatterns` skips, such as the generated code that the core ignore patterns cover, no longer fails the check. A file that `tsconfig.json` excludes still gets type errors when Oxlint lints it, and an invalid compiler option still fails the check.

The core preset sets `checksConditionals: { flagUnions: "strict" }` on `typescript/no-misused-promises`. The rule now also reports a condition on a union of a promise and its awaited type, such as `Promise<number> | number`. A promise is always truthy, so the condition ignores the number that the promise resolves to. It still accepts an optional promise such as `Promise<void> | undefined` in `if (pending) await pending`. It reports `Promise<undefined> | undefined`, because its awaited type matches the other member.

The effect preset enables two of the three new `@effect/tsgo` rules:

- `effecttsgo/promise-all-in-effect` reports `Promise.all` or `Promise.allSettled` over an array inside Effect code. `Effect.forEach` or `Effect.all` with a `concurrency` option replaces it.
- `effecttsgo/promise-race-in-effect` reports `Promise.race` or `Promise.any` inside Effect code, which leaves the losing promises running.

The preset leaves `effecttsgo/flat-map-map-to-zip-with` off. It reports an `Effect.flatMap` whose callback builds the inner effect from state that the outer effect changes, where `Effect.zipWith` gives a different result. [Effect-TS/tsgo#1085](https://github.com/Effect-TS/tsgo/issues/1085) tracks the fix.

To upgrade an existing project:

- With npm, install the new Adamantite release and `tsrs@7.1.0-beta.tsrs4` in one command, such as `npm install -D adamantite@latest tsrs@7.1.0-beta.tsrs4`. Add `oxlint@1.94.0` when the project pins an older Oxlint. npm rejects the new Adamantite release with `ERESOLVE` while `package.json` pins an older `tsrs` or Oxlint.
- Run `adamantite update` to install the other new versions.
- Expect `adamantite check` to report the conditions and the Effect code that the new options and rules describe.
