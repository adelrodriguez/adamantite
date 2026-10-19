---
"adamantite": minor
---

Update Oxlint and `@effect/tsgo`, and enable five new rules in the effect preset

Update the managed tooling versions: Oxlint 1.88.0, oxlint-tsgolint 7.0.2004, and `@effect/tsgo` 0.54.0. Also update the runtime dependency `@oxlint/plugins` to 1.88.0.

The effect preset enables these new `@effect/tsgo` rules:

- `error-payload-shadows-name` reports an error payload field named `name`. The field replaces the error's own name, so logs and `String(error)` show the field value instead of the error type.
- `schema-class-object-literal` reports an object literal that is checked as a Schema class instance. The object has no class prototype, so `instanceof`, methods, and encoding can fail.
- `schema-class-missing-brand` reports a Schema class, error, or Opaque class without a brand type argument. Without a brand, TypeScript accepts structurally compatible values as instances.
- `effect-sleep-zero-to-yield-now` reports `Effect.sleep(0)`. Use `Effect.yieldNow`.
- `flat-map-to-tap` reports a `flatMap` or `andThen` callback that runs an effect and returns its parameter unchanged. Use `Effect.tap`.

`adamantite rule add` now names its error `InvalidRuleName` when the rule name is not kebab-case. Before, the error took the rule name as its name.

To upgrade an existing project:

- Run `adamantite update`. It installs the new versions and patches them again.
- Expect `adamantite check` to report Schema classes without a brand. Add `{ readonly brand: unique symbol }` as the second type argument, or add `{}` to keep the class structural.
- Oxlint 1.88 compares keys with ESLint's `natural-compare` in `sort-keys` with `natural: true`, which the core preset sets ([oxc#27579](https://github.com/oxc-project/oxc/pull/27579)). `adamantite check` can report different objects.
- `@effect/tsgo` 0.54.0 patches TypeScript 7.0.2 and `7.1.0-dev.20261018.1`. With another TypeScript version, the `prepare` script fails. Install one of those versions.
