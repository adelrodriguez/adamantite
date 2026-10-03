import type { OxlintConfig } from "oxlint"

// The Effect Language Service for TypeScript-Go (https://github.com/Effect-TS/tsgo) reports
// misuse of Effect: effects that never run, unhandled errors and requirements, nested effects, and
// combinators that have a direct replacement.
//
// @effect/tsgo is a managed plugin, but it is not a `jsPlugins` package. The rules are native
// type-aware rules that exist only after `effect-tsgo patch --oxlint --typescript` replaces the
// Oxlint and oxlint-tsgolint binaries in `node_modules`. Without the patch, Oxlint stops with
// "Unknown plugin: 'effecttsgo'". `adamantite prepare` runs the patch from the `prepare` script
// after each install, and `adamantite init` and `adamantite update` run it after they install
// packages. Doctor and update keep the package on its pinned version.
//
// The rules read their options, such as `allowedUnstableApis`, from the `@effect/language-service`
// plugin entry in `tsconfig.json`.
//
// The preset enables only rules that report Effect code. It does not ban platform APIs in code
// that is not Effect code. See ADR 0007 for the criteria.
const config: OxlintConfig = {
  options: {
    typeAware: true,
  },
  plugins: ["effecttsgo"],
  rules: {
    // Correctness: wrong, unsafe, or structurally invalid Effect code.
    "effecttsgo/any-unknown-in-error-context": "error",
    "effecttsgo/class-self-mismatch": "error",
    "effecttsgo/duplicate-package": "error",
    "effecttsgo/effect-fn-implicit-any": "error",
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
    "effecttsgo/global-error-in-effect-catch": "error",
    "effecttsgo/global-error-in-effect-failure": "error",
    "effecttsgo/layer-merge-all-with-dependencies": "error",
    "effecttsgo/lazy-effect": "error",
    "effecttsgo/lazy-promise-in-effect-sync": "error",
    "effecttsgo/leaking-requirements": "error",
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
    "effecttsgo/effect-succeed-with-void": "error",
    "effecttsgo/flat-map-conditional-to-filter-or-fail": "error",
    "effecttsgo/flat-map-ignored-param-to-and-then": "error",
    "effecttsgo/flat-map-to-map": "error",
    "effecttsgo/map-some-to-as-some": "error",
    "effecttsgo/match-effect-to-map-both": "error",
    "effecttsgo/match-effect-to-match": "error",
    "effecttsgo/multiple-catch-tag": "error",
    "effecttsgo/nested-effect-gen-yield": "error",
    "effecttsgo/option-match-to-from-option": "error",
    "effecttsgo/prefer-schema-type-property": "error",
    "effecttsgo/prefer-succeed-some-or-none": "error",
    "effecttsgo/prefer-typed-schema-decoder": "error",
    "effecttsgo/provide-layer-succeed-to-provide-service": "error",
    "effecttsgo/race-first-with-sleep-to-timeout": "error",
    "effecttsgo/redundant-map-error": "error",
    "effecttsgo/redundant-or-die": "error",
    "effecttsgo/redundant-schema-tag-identifier": "error",
    "effecttsgo/run-of-exit-to-run-exit": "error",
    "effecttsgo/schema-number": "error",
    "effecttsgo/schema-struct-with-tag": "error",
    "effecttsgo/schema-union-of-literals": "error",
    "effecttsgo/service-not-as-class": "error",
    "effecttsgo/sync-to-succeed": "error",
    "effecttsgo/timeout-catch-tag-to-timeout-or-else": "error",
    "effecttsgo/unnecessary-effect-gen": "error",
    "effecttsgo/unnecessary-fail-yieldable-error": "error",
    "effecttsgo/unnecessary-pipe": "error",
    "effecttsgo/unnecessary-pipe-chain": "error",
    "effecttsgo/unnecessary-typeof-type": "error",
  },
}

export default config
