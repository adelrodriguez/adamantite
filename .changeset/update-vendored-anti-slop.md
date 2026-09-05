---
"adamantite": minor
---

Update the vendored anti-slop plugin to upstream v0.1.2 (`e8c4880`)

The bundled build moves from `446268e` to `e8c4880`, picking up the v0.1.1 and v0.1.2 releases. The rule set is unchanged, so no preset configuration changes are needed. **Some rules are stricter than before, so source that passed `adamantite check` on 0.38.0 can start reporting `anti-slop` errors after this update.** The tightenings:

- `no-unknown-parameters` and `no-unknown-type-aliases` now also report union types that contain `unknown`, such as `input: string | unknown` or `type T = string | unknown`.
- `no-object-parameters`, `no-unknown-returns`, `no-unknown-type-aliases`, and `no-known-value-widening` now resolve block-scoped, forward-referenced, and transparent generic type aliases, so an alias declared inside a function body is no longer overlooked.
- `no-known-value-widening` also flags known values passed into local `unknown` type predicates.

The relaxations, where previously reported code is now accepted:

- `no-runtime-typeof` now allows every `typeof x === "undefined"` comparison, not only existence probes such as `typeof document === "undefined"`. Comparisons against any other type string are still reported.
- `no-unknown-parameters` allows `unknown` on the exact subject of a type predicate.
- `no-shape-in-symbol-names` allows static member reads such as Zod's `schema.shape`.
- `no-unsafe-dictionary-type` allows generic constraints such as `T extends Record<string, unknown>`.
- `require-safety-comment-for-type-assertion` recognizes comments above exported declarations and accepts a `markers` option for alternative prefixes.

Upstream also added a separate opt-in `anti-slop-effect` plugin with one rule, `no-service-constructor-imports`. It is not vendored here because it lives behind its own entry point and encodes Effect service-layer architecture policy rather than generic lint rules.
