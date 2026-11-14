# Idiom sources

Each idiom is a short adaptation of ordinary code from a permissively licensed project, or code
written for Adamantite. A source link points to the lines at a pinned commit. A fixable idiom and
its fixed file share one row. [NOTICES.md](NOTICES.md) holds the copyright and license notice of
each source project.

Most adaptations add the forms that Adamantite accepts, such as blank lines between statements, a
brand on each `Schema.Class` and `Schema.TaggedError`, and sorted keys.

## core

| File | Source | License | Changes |
| --- | --- | --- | --- |
| `clean/abort-error.ts` | [p-retry](https://github.com/sindresorhus/p-retry/blob/ac3c4cdb7f015e1f71825e4274e2323a49b615eb/index.js#L59-L83) | MIT | A TypeScript class with an `override` name, and an optional call of `throwIfAborted`. |
| `clean/build-object.ts` | [Jest](https://github.com/jestjs/jest/blob/aa88f7cf0bfc7a3a2efbfcab97914886b22d4454/packages/jest-each/src/table/template.ts#L40-L44), [defu](https://github.com/unjs/defu/blob/82632b66f5914e9946edce300e10633a3d5c0cb7/src/defu.ts#L45-L49) | MIT | Two small functions in place of the upstream modules. |
| `clean/copy-options.ts` | [defu](https://github.com/unjs/defu/blob/82632b66f5914e9946edce300e10633a3d5c0cb7/src/defu.ts#L4-L10), [ufo](https://github.com/unjs/ufo/blob/f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6/src/url.ts#L117-L126) | MIT | One function with a spread copy, an `Object.assign` merge, and `structuredClone`. |
| `clean/guards.ts` | [Jest](https://github.com/jestjs/jest/blob/aa88f7cf0bfc7a3a2efbfcab97914886b22d4454/packages/jest-util/src/isNonNullable.ts#L8-L10) | MIT | Adds a `typeof` predicate. |
| `clean/index.ts` | [ufo](https://github.com/unjs/ufo/blob/f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6/src/index.ts#L1-L5) | MIT | Re-exports the guards and segments idioms. |
| `clean/literals.ts` | [ufo](https://github.com/unjs/ufo/blob/f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6/src/utils.ts#L11-L16) | MIT | Lowercase hex and numeric separators, from the hex case of `format.test.ts`. Oxfmt always writes hex digits in lowercase. |
| `clean/queue.ts` | [p-queue](https://github.com/sindresorhus/p-queue/blob/7f272ab5ff2254c0dc2537b7977e88ede1cd55e8/source/index.ts#L97-L154) | MIT | A small class with a private counter and a `Map` of `Set` listeners. |
| `clean/retry.ts` | [p-retry](https://github.com/sindresorhus/p-retry/blob/ac3c4cdb7f015e1f71825e4274e2323a49b615eb/index.js#L293-L312) | MIT | One awaited attempt that wraps the error in `cause`. |
| `clean/segments.ts` | [ufo](https://github.com/unjs/ufo/blob/f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6/src/utils.ts#L463-L483) | MIT | A `for...of` loop over `entries()` that labels each segment. |
| `clean/worker-message.ts` | [Jest](https://github.com/jestjs/jest/blob/aa88f7cf0bfc7a3a2efbfcab97914886b22d4454/packages/jest-worker/src/types.ts#L234-L239) | MIT | Two message kinds with an exhaustive `switch`. |
| `fixable/abort-error.ts` | [p-retry](https://github.com/sindresorhus/p-retry/blob/ac3c4cdb7f015e1f71825e4274e2323a49b615eb/index.js#L59-L83) | MIT | Adds a constructor that only calls `super`, which the fix removes. |
| `fixable/greeting.ts` | Written for Adamantite | | String concatenation, which the fix writes as a template literal. |
| `fixable/literals.ts` | `format.test.ts` | | Uppercase hex and a number without separators. |
| `fixable/moved.ts` | `fix.test.ts` | | `no-else-return` moves a statement that then needs a blank line. A known second pass. |
| `fixable/suppressed.ts` | `fix.test.ts` | | A suppression with a reason that suppresses nothing. |
| `fixable/unbreakable.ts` | `fix.test.ts` | | A template literal past the print width that Oxfmt cannot wrap. |
| `fixable/wrapped.ts` | `fix.test.ts` | | A line that Oxfmt wraps, after which the spacing rule needs a blank line. |

## node

| File | Source | License | Changes |
| --- | --- | --- | --- |
| `clean/cli-options.ts` | [Node.js docs](https://github.com/nodejs/node/blob/530b8e3a983666c958d8f3b8b42c7cea3afd2765/doc/api/util.md#L2381-L2399) | MIT | A `port` option with a `process.env` fallback and a range check. |
| `clean/compress.ts` | [Node.js docs](https://github.com/nodejs/node/blob/530b8e3a983666c958d8f3b8b42c7cea3afd2765/doc/api/stream.md#L122-L132) | MIT | The awaited `pipeline` in a function. |
| `clean/read-config.ts` | [Node.js docs](https://github.com/nodejs/node/blob/530b8e3a983666c958d8f3b8b42c7cea3afd2765/doc/api/fs.md#L1960-L1985) | MIT | `readFile` of a joined path, with the error in `cause`. |

## effect

| File | Source | License | Changes |
| --- | --- | --- | --- |
| `clean/array.ts` | [Array tests](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/packages/effect/test/Array.test.ts#L834-L842) | MIT | `Array.map` and `Array.head` as exports, in place of assertions. |
| `clean/catch-tag.ts` | [error-handling](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/04_errors/01_error-handling.ts#L14-L29) | MIT | One branded error and one `catchTag` handler that reads its payload. |
| `clean/cli.ts` | [cli basics](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/70_cli/10_basics.ts#L41-L74) | MIT | One command with one argument. |
| `clean/clock.test.ts` | [effect-tests](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/09_testing/10_effect-tests.ts#L28-L39) | MIT | One test that adjusts the clock before it joins the fiber. |
| `clean/config.ts` | [layer-unwrap](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/03_services/20_layer-unwrap.ts#L51-L63) | MIT | The two config values in `Effect.gen`, without the layer. |
| `clean/counter.test.ts` | [layer-tests](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/09_testing/20_layer-tests.ts#L92-L105) | MIT | A `Ref` service in place of the upstream services. |
| `clean/database.ts` | [service](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/03_services/01_service.ts#L13-L37) | MIT | `Layer.succeed` in place of `Layer.effect`, a query without an error type, and blank lines. |
| `clean/layers.ts` | [layer-composition](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/03_services/20_layer-composition.ts#L24-L69) | MIT | Two small services in place of the upstream services. |
| `clean/match.ts` | [Match tests](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/packages/effect/test/Match.test.ts#L38-L46) | MIT | An export in place of assertions. |
| `clean/option.ts` | [Option tests](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/packages/effect/test/Option.test.ts#L211-L218) | MIT | Exports in place of assertions. |
| `clean/process-file.ts` | [effect-gen](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/01_basics/01_effect-gen.ts#L8-L30) | MIT | A branded error, the program as an export, and a span without attributes. |
| `clean/read-file.ts` | [Generate.ts](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/packages/tools/graphql-generator/src/internal/Generate.ts#L52-L67) | MIT | One read of a joined path. |
| `clean/recover.ts` | [catch-tags](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/04_errors/10_catch-tags.ts#L9-L24) | MIT | Branded errors, and sorted handlers. |
| `clean/string.ts` | [String tests](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/packages/effect/test/String.test.ts#L210-L227) | MIT | Exports in place of assertions. |
| `clean/user.ts` | [schema-basics](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/02_schema/10_schema-basics.ts#L15-L33) | MIT | A brand, and the decoder and encoder as exports. |
| `fixable/as.ts` | Written for Adamantite | | `Effect.map` of a constant, which the fix writes as `Effect.as`. |
| `fixable/handlers.ts` | [catch-tags](https://github.com/Effect-TS/effect/blob/f18320b2b84f77a197037fdccaf41808d8c82d4b/ai-docs/src/01_effect/04_errors/10_catch-tags.ts#L9-L24) | MIT | The upstream order of the handlers, which the fix sorts. |
| `fixable/map.ts` | Written for Adamantite | | `Effect.flatMap` of `Effect.succeed`, which the fix writes as `Effect.map`. |
