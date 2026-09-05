---
"adamantite": patch
---

Update the vendored anti-slop plugin to upstream v0.1.2 (`e8c4880`)

The bundled build moves from `446268e` to `e8c4880`, picking up the v0.1.1 and v0.1.2 correctness fixes. The rule set is unchanged, so no preset configuration changes are needed, but several rules now resolve more cases and tolerate more legitimate ones:

- `no-known-value-widening` now also flags known values passed into local `unknown` type predicates, and tolerates empty dictionary accumulators and finite-key `Record` targets.
- `no-object-parameters`, `no-unknown-returns`, and `no-unknown-type-aliases` now resolve block-scoped, forward-referenced, and transparent generic type aliases.
- `no-unknown-parameters` allows `unknown` on the exact subject of a type predicate.
- `no-runtime-typeof` always allows existence probes such as `typeof document === "undefined"`.
- `no-shape-in-symbol-names` allows static member reads such as Zod's `schema.shape`.
- `no-unsafe-dictionary-type` allows generic constraints such as `T extends Record<string, unknown>`.
- `require-safety-comment-for-type-assertion` recognizes comments above exported declarations and accepts a `markers` option for alternative prefixes.

Upstream also added a separate opt-in `anti-slop-effect` plugin with one rule, `no-service-constructor-imports`. It is not vendored here because it lives behind its own entry point and encodes Effect service-layer architecture policy rather than generic lint rules.
