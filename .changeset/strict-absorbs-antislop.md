---
"adamantite": minor
---

Move the anti-slop rules into the strict preset, and retire the antislop preset

The `strict` preset now loads the vendored anti-slop rules. They report `unknown` in signatures, loose dictionary types, `typeof` checks outside type predicates, `Reflect.get` and `Reflect.apply`, module mocks, adjacent `filter` and `map` passes, accumulator copies in `reduce`, and missing blank lines between statement groups.

The assertion rules `require-safety-comment-for-type-assertion`, `no-chained-type-assertions`, and `no-widen-then-assert` now apply only in test files. Outside tests, `typescript/consistent-type-assertions` already bans each assertion, so an assertion gets one report instead of several.

`adamantite/lint/antislop` no longer exists, and `init` no longer offers it.

To upgrade an existing project:

- Run `adamantite update` to install the new version.
- If `oxlint.config.ts` imports `adamantite/lint/antislop`, replace it with `adamantite/lint/strict`, or remove it when the config already imports `strict`. `adamantite doctor` reports this import. Overrides of `anti-slop/*` rules keep working.
- If the project used `strict` without `antislop`, run `adamantite fix` to add the blank lines that `require-readable-spacing` reports, and expect `adamantite check` to report the code that the other anti-slop rules describe.
