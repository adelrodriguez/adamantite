import type { OxlintConfig } from "oxlint"
import { firstPartyPlugin } from "./plugins/entry.ts"

// The Effect Language Service for TypeScript-Go (https://github.com/Effect-TS/tsgo) reports
// misuse of Effect: effects that never run, unhandled errors and requirements, nested effects, and
// combinators that have a direct replacement.
//
// @effect/tsgo is a managed plugin, but it is not a `jsPlugins` package. The rules are native
// type-aware rules that exist only in the Effect builds of the Oxlint binding and tsrs,
// which @effect/tsgo ships. Adamantite runs Oxlint through its entry `dist/oxlint.js`, which loads
// those builds when the project installs @effect/tsgo. Plain `oxlint` stops with
// "Unknown plugin: 'effecttsgo'". See ADR 0019 and ADR 0021.
//
// The rules read their options, such as `allowedUnstableApis`, from the `@effect/language-service`
// plugin entry in `tsconfig.json`.
//
// The preset enables only the @effect/tsgo rules that report Effect code. It does not ban platform
// APIs in code that is not Effect code. See ADR 0007 for the criteria.
//
// The preset also loads the anti-slop-effect plugin, which reports tagged values that code handles
// by hand instead of with Effect's tagged constructors, `Match`, and `catchTag`. Its rules started
// as a copy of the Effect rules of https://github.com/dmmulroy/anti-slop and now live in
// plugins/anti-slop-effect/ as first-party code. They keep the `anti-slop-effect` namespace, so
// project settings and suppressions keep working. The preset targets Effect codebases, so it
// enables every rule of the plugin.

const config: OxlintConfig = {
  jsPlugins: [firstPartyPlugin("anti-slop-effect")],
  options: {
    typeAware: true,
  },
  // @ts-expect-error - Oxlint's `LintPluginOptionsSchema` lists only its built-in plugins. Remove
  // this line when Oxlint's config types accept `effecttsgo`.
  plugins: ["effecttsgo"],
  rules: {
    // Correctness: wrong, unsafe, or structurally invalid Effect code.
    "effecttsgo/any-unknown-in-error-context": "error",
    "effecttsgo/class-self-mismatch": "error",
    "effecttsgo/duplicate-package": "error",
    "effecttsgo/effect-fn-implicit-any": "error",
    "effecttsgo/error-payload-shadows-name": "error",
    "effecttsgo/experimental-api-usage": "error",
    "effecttsgo/floating-effect": "error",
    "effecttsgo/floating-effect-in-vitest": "error",
    "effecttsgo/generic-effect-services": "error",
    "effecttsgo/missing-effect-context": "error",
    "effecttsgo/missing-effect-error": "error",
    "effecttsgo/missing-layer-context": "error",
    "effecttsgo/missing-return-yield-star": "error",
    "effecttsgo/missing-star-in-yield-effect-gen": "error",
    "effecttsgo/non-object-effect-service-type": "error",
    "effecttsgo/obsolete-match-import": "error",
    "effecttsgo/obsolete-schema-import": "error",
    "effecttsgo/outdated-api": "error",
    "effecttsgo/overridden-schema-constructor": "error",
    "effecttsgo/promise-in-effect-success": "error",
    "effecttsgo/schema-class-missing-brand": "error",
    "effecttsgo/schema-class-object-literal": "error",
    "effecttsgo/schema-literal-non-finite": "error",
    "effecttsgo/schema-opaque-instance-member": "error",
    "effecttsgo/unsafe-effect-type-assertion": "error",
    "effecttsgo/unstable-api-usage": "error",

    // Anti-patterns: Effect code that often runs differently than it reads.
    "effecttsgo/catch-unfailable-effect": "error",
    "effecttsgo/effect-fn-iife": "error",
    "effecttsgo/effect-gen-uses-adapter": "error",
    "effecttsgo/effect-in-failure": "error",
    "effecttsgo/effect-in-void-success": "error",
    "effecttsgo/effect-try-without-catch": "error",
    "effecttsgo/global-error-in-effect-catch": "error",
    "effecttsgo/global-error-in-effect-failure": "error",
    "effecttsgo/layer-merge-all-with-dependencies": "error",
    "effecttsgo/lazy-effect": "error",
    "effecttsgo/lazy-promise-in-effect-sync": "error",
    "effecttsgo/leaking-requirements": "error",
    "effecttsgo/missing-concurrency-option": "error",
    "effecttsgo/multiple-effect-provide": "error",
    "effecttsgo/prefer-unsafe-constructor": "error",
    "effecttsgo/return-effect-in-gen": "error",
    "effecttsgo/run-effect-inside-effect": "error",
    "effecttsgo/schema-sync-in-effect": "error",
    "effecttsgo/scope-in-layer-effect": "error",
    "effecttsgo/try-catch-in-effect-gen": "error",
    "effecttsgo/unknown-in-effect-catch": "error",

    // Effect-native APIs inside Effect code, so tests can control time, randomness, and config.
    "effecttsgo/abort-controller-in-effect": "error",
    "effecttsgo/crypto-random-uuid-in-effect": "error",
    "effecttsgo/global-console-in-effect": "error",
    "effecttsgo/global-date-in-effect": "error",
    "effecttsgo/global-fetch-in-effect": "error",
    "effecttsgo/global-json-in-effect": "error",
    "effecttsgo/global-random-in-effect": "error",
    "effecttsgo/global-timers-in-effect": "error",
    "effecttsgo/instance-of-schema": "error",
    "effecttsgo/process-env-in-effect": "error",

    // Style: combinators and constructs with a direct, simpler Effect replacement.
    "effecttsgo/acquire-release-disposable": "error",
    "effecttsgo/all-of-map-to-for-each": "error",
    "effecttsgo/catch-all-tag-dispatch-to-catch-tag": "error",
    "effecttsgo/catch-all-to-map-error": "error",
    "effecttsgo/catch-chain-to-first-success-of": "error",
    "effecttsgo/catch-conditional-refail-to-catch-if": "error",
    "effecttsgo/catch-die-to-or-die": "error",
    "effecttsgo/catch-if-tag-to-catch-tag": "error",
    "effecttsgo/catch-refail-to-tap-error": "error",
    "effecttsgo/catch-tag-to-catch-reason": "error",
    "effecttsgo/catch-to-ignore": "error",
    "effecttsgo/catch-to-or-else-succeed": "error",
    "effecttsgo/effect-do-notation": "error",
    "effecttsgo/effect-fn-opportunity": "error",
    "effecttsgo/effect-map-flatten": "error",
    "effecttsgo/effect-map-void": "error",
    "effecttsgo/effect-sleep-zero-to-yield-now": "error",
    "effecttsgo/effect-succeed-with-undefined": "error",
    "effecttsgo/effect-succeed-with-void": "error",
    "effecttsgo/fail-cause-to-constructor": "error",
    "effecttsgo/flat-map-conditional-to-filter-or-fail": "error",
    "effecttsgo/flat-map-identity-to-flatten": "error",
    "effecttsgo/flat-map-ignored-param-to-and-then": "error",
    "effecttsgo/flat-map-to-map": "error",
    "effecttsgo/flat-map-to-tap": "error",
    "effecttsgo/manual-metric-tap-to-track": "error",
    "effecttsgo/map-const-to-as": "error",
    "effecttsgo/map-map-error-to-map-both": "error",
    "effecttsgo/map-some-catch-no-such-element": "error",
    "effecttsgo/map-some-to-as-some": "error",
    "effecttsgo/match-boolean-to-is-success": "error",
    "effecttsgo/match-effect-to-map-both": "error",
    "effecttsgo/match-effect-to-match": "error",
    "effecttsgo/match-to-result-or-option": "error",
    "effecttsgo/multiple-catch-tag": "error",
    "effecttsgo/nested-effect-gen-yield": "error",
    "effecttsgo/on-exit-failure-to-on-error": "error",
    "effecttsgo/option-match-to-from-option": "error",
    "effecttsgo/prefer-schema-type-property": "error",
    "effecttsgo/prefer-succeed-some-or-none": "error",
    "effecttsgo/prefer-typed-schema-decoder": "error",
    "effecttsgo/provide-layer-succeed-to-provide-service": "error",
    "effecttsgo/provide-merge-all-to-array": "error",
    "effecttsgo/race-first-with-sleep-to-timeout": "error",
    "effecttsgo/redundant-map-error": "error",
    "effecttsgo/redundant-or-die": "error",
    "effecttsgo/redundant-schema-tag-identifier": "error",
    "effecttsgo/result-match-to-from-result": "error",
    "effecttsgo/run-of-exit-to-run-exit": "error",
    "effecttsgo/schema-number": "error",
    "effecttsgo/schema-struct-with-tag": "error",
    "effecttsgo/schema-union-of-literals": "error",
    "effecttsgo/service-not-as-class": "error",
    "effecttsgo/suspend-fail-to-fail-sync": "error",
    "effecttsgo/sync-to-succeed": "error",
    "effecttsgo/timeout-catch-tag-to-timeout-or-else": "error",
    "effecttsgo/unnecessary-effect-gen": "error",
    "effecttsgo/unnecessary-fail-yieldable-error": "error",
    "effecttsgo/unnecessary-pipe": "error",
    "effecttsgo/unnecessary-pipe-chain": "error",
    "effecttsgo/unnecessary-typeof-type": "error",

    "anti-slop-effect/no-manual-effect-error-tag": "error",
    "anti-slop-effect/no-manual-tag-comparison": "error",
    "anti-slop-effect/no-manual-tagged-construction": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop-effect/prefer-effect-match": "error",

    // Core turns on these promise rules, which match `catch` by its name only. They cannot prove
    // that the `Effect` of an import is not a promise, so they read `Effect.catch` as
    // `Promise.prototype.catch`. `no-nesting` reports an `Effect.catch` in the handler of another,
    // and `valid-params` reports the data-first `Effect.catch(effect, handler)`. Oxlint gives the
    // rules no option to ignore a receiver, so an Effect project turns them off. TypeScript still
    // checks the arguments of a promise method.
    "promise/no-nesting": "off",
    "promise/valid-params": "off",

    // Core turns on these unicorn rules, which match an array method by its name only. They read
    // `Option.some(value)` as `Array.prototype.some` with a callback, and the data-first
    // `Array.findLast(values, predicate)` as an array method with a `thisArg`. Oxlint gives the
    // rules no option to ignore a receiver, so an Effect project turns them off.
    "unicorn/no-array-callback-reference": "off",
    "unicorn/no-array-method-this-argument": "off",
    // TEMPORARY: The core rule reads a call of a function whose name ends in `Error` as an error
    // made without `new`. It skips `Data.TaggedError`, but it reports `Schema.TaggedError` and
    // `Schema.Error`, and its fix adds `new`, which breaks the class. Remove this line when Oxlint
    // skips them too: https://github.com/oxc-project/oxc/issues/27718
    "unicorn/throw-new-error": "off",
  },
}

export default config
