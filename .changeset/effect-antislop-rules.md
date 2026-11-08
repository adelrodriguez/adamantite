---
"adamantite": minor
---

Enable the anti-slop-effect rules in the effect preset

The `effect` preset now loads a vendored build of the `anti-slop-effect` plugin from [anti-slop](https://github.com/dmmulroy/anti-slop) and enables all of its rules:

- `no-manual-tagged-construction` reports an object literal with a `_tag`. Use a tagged class, such as `Data.TaggedClass` or `Data.TaggedError`, or the `make` of a tagged Schema.
- `no-manual-tag-comparison` reports a comparison or a `switch` on `_tag`. Use `Match.tag`, `Predicate.isTagged`, or a helper such as `Option.isNone`.
- `no-manual-effect-error-tag` reports a broad `Effect.catch` handler that branches on `_tag`. Use `Effect.catchTag` or `Effect.catchReason`.
- `prefer-effect-match` reports a chain of ternaries that compare one value with literals. Use `Match` or a lookup table.
- `no-service-constructor-imports` reports a `make*` import from a project file outside tests. Import the Layer of the service instead.

The project installs nothing extra.

To upgrade an existing project:

- Run `adamantite update` to install the new version.
- Expect `adamantite check` to report the code that these rules describe. A plain union with a `_tag` field, such as `{ readonly _tag: "File"; readonly path: string }`, becomes one `Data.TaggedClass` for each variant. The core preset enables `no-redeclare`, so give the union type and its constructors different names.
