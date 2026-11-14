# Vendored padding-line-between-statements

Source: [ESLint Stylistic](https://github.com/eslint-stylistic/eslint-stylistic), commit `435c3ea0fd26a5fef9042c4b36b6e165fbbf8d08`.

Copied files:

- `packages/eslint-plugin/rules/padding-line-between-statements/padding-line-between-statements.ts`
- `packages/eslint-plugin/rules/padding-line-between-statements/types.d.ts` → `padding-line-options.ts`
- Root `LICENSE`, retained verbatim. Both OpenJS Foundation and ESLint Stylistic notices apply.

The rule is MIT-licensed. Keep `LICENSE` with every redistributed copy, including skill assets. No Stylistic, ESLint, TypeScript-ESLint, or additional parser runtime dependency is required.

## Local adaptations

- Replace upstream type aliases with Oxlint's ESTree, context, token/comment, and rule types. Upstream's token type includes comments; Oxlint exposes those separately.
- Replace `AST_NODE_TYPES` enum members with identical string literals.
- Guard indexed reads for consuming repositories with `noUncheckedIndexedAccess`. Impossible missing AST/configuration entries raise explicit invariant errors rather than introducing new non-null assertions.
- Replace the repository-specific `createRule` factory with `createPaddingLineRule(options, statementTypes?, readPrintWidth?)`. The antislop wrapper supplies the policy options directly. Its only user option is `printWidth`. The optional second argument registers caller-defined statement types, consulted before the upstream table, so a policy can match syntax the upstream matchers do not distinguish (exported bindings, comment ownership) without editing the vendored tables.
- Implement the small required AST helper surface in `padding-line-ast.ts` using Oxlint's public source-code/token API. `isParenthesized` only needs the one-pair check used to exclude parenthesized directive strings, not the upstream general-purpose overloads.
- Retain the upstream statement matchers, scope tracking, comment-aware insertion/removal, selector support, and diagnostic text. Upstream naming and non-null assumptions remain localized here to keep future diffs reviewable; the file is not a model for new application code.

The opinionated policy lives outside this directory in `../../rules/require-readable-spacing.ts`. It adds spacing without collapsing existing blank lines. Short local bindings, consecutive imports, and adjacent overload signatures/implementation remain grouped. Spacing is syntactic, not an inference of business-logic boundaries.

## Updating and verification

Fetch an explicit upstream revision, compare the original rule and types against this revision, and port relevant fixes while retaining the adapters above. Update this record and preserve the license. Run `pnpm check` as required by repository guidance.

Focused Oxlint RuleTester cases live in `src/__tests__/plugins/antislop/require-readable-spacing.test.ts`; they test exact fixes, JSDoc/trailing comments, same-line statements, semicolon-free code, TypeScript exports/overloads, Effect-style generators, and upstream removal behavior. `src/__tests__/presets/require-readable-spacing.test.ts` verifies the plugin through the Oxlint CLI on multiple files, including rejection, autofix, and repeated-fix stability. The complete upstream JS/TS test suites have not been ported; this is focused compatibility evidence, not a claim of full upstream conformance.

## Adamantite changes

Adamantite copied this folder from antislop and lints it with its own presets:

- Missing tokens and scopes raise the `Padding rule invariant` errors instead of non-null assertions.
- The unused ESLint options schema is removed. `require-readable-spacing` has its own schema with
  one option, `printWidth`.
- The statement table is a `Map` built from one key-sorted object and the derived `singleline-` and
  `multiline-` entries.
- The `@private` JSDoc tags are removed, and `padding-line-options.d.ts` is now
  `padding-line-options.ts`, so the build emits it.
- `getActualLastToken` moved to `padding-line-ast.ts`, and `isSingleLine` uses it to find the end
  of a statement. Upstream reads the end from the node location, so the semicolon-less style's
  semicolon in `const b = 2\n;[a, b].forEach(f)` made `const b = 2` a multiline statement.
- A statement counts as single-line only when it is on one line and its actual last token ends at
  or before `printWidth`. `NodeTest` takes `printWidth` as a third parameter, and `match` passes the
  value that the optional third argument of `createPaddingLineRule` reads from the rule context.
  The `singleline-` and `multiline-` statement types and the selector `lineMode` use
  `fitsOnOneLine`. Without that argument, the width is infinite, so only line breaks count, as
  upstream. `adamantite fix` runs lint before Oxfmt, and Oxfmt wraps a line longer than its
  `printWidth`, so the rule asks for the blank lines that the wrapped statement needs.
