---
"adamantite": minor
---

Move the anti-slop rules into the strict preset, and retire the antislop preset

The `strict` preset now loads the vendored anti-slop rules, updated to anti-slop commit `13909c9`. They report `unknown` in signatures, loose dictionary types, `typeof` checks outside type predicates, `Reflect.get` and `Reflect.apply`, module mocks, adjacent `filter` and `map` passes, accumulator copies in `reduce`, and missing blank lines between statement groups.

These rules are new in this anti-slop version:

- `no-array-filter-map` reports a `filter` and a `map` chained on one array, which walk the array twice. Use a single `flatMap`, or `.values().filter().map().toArray()` where the runtime supports iterator helpers.
- `no-reduce-accumulator-copy` reports a `reduce` callback that copies its accumulator on each step with `Object.assign`, `Array.from`, `concat`, or another array copy method. Mutate an accumulator that the callback owns and return it.
- `require-readable-spacing` requires a blank line around multi-line statements, declarations, and blocks, and before `return`, `if`, and loop statements. Consecutive single-line bindings stay together. The rule has an autofix that only adds blank lines.

The assertion rules `require-safety-comment-for-type-assertion`, `no-chained-type-assertions`, and `no-widen-then-assert` now apply only in test files. Outside tests, `typescript/consistent-type-assertions` already bans each assertion, so an assertion gets one report instead of several.

`adamantite/lint/antislop` no longer exists, and `init` no longer offers it.

To upgrade an existing project:

- Run `adamantite update` to install the new version.
- If `oxlint.config.ts` imports `adamantite/lint/antislop`, replace it with `adamantite/lint/strict`, or remove it when the config already imports `strict`. `adamantite doctor` reports this import. Settings for `anti-slop/*` rules keep working, with one exception: `strict` sets the three assertion rules in an override for test files, which takes priority over top-level `rules`. Move a project setting for those rules into an `overrides` entry with `files: ["**/*.{test,spec}.{ts,tsx,mts,cts}", "**/__tests__/**"]`.
- Run `adamantite fix` to add the blank lines that `require-readable-spacing` reports.
- Expect `adamantite check` to report the code that the other new rules describe. A project that used `strict` without `antislop` gets reports from all the anti-slop rules.
