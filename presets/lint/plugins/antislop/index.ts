import type { Plugin, Rule } from "@oxlint/plugins"
import noArrayFilterMap from "./rules/no-array-filter-map.ts"
import noChainedTypeAssertions from "./rules/no-chained-type-assertions.ts"
import noConditionalEmptyObjectSpread from "./rules/no-conditional-empty-object-spread.ts"
import noKnownValueWidening from "./rules/no-known-value-widening.ts"
import noModuleMocking from "./rules/no-module-mocking.ts"
import noObjectParameters from "./rules/no-object-parameters.ts"
import noReduceAccumulatorCopy from "./rules/no-reduce-accumulator-copy.ts"
import noReflectApply from "./rules/no-reflect-apply.ts"
import noReflectGet from "./rules/no-reflect-get.ts"
import noRuntimeTypeof from "./rules/no-runtime-typeof.ts"
import noForbiddenTermInSymbolNames from "./rules/no-shape-in-symbol-names.ts"
import noUnknownParameters from "./rules/no-unknown-parameters.ts"
import noUnknownReturns from "./rules/no-unknown-returns.ts"
import noUnknownTypeAliases from "./rules/no-unknown-type-aliases.ts"
import noUnsafeDictionaryType from "./rules/no-unsafe-dictionary-type.ts"
import noWidenThenAssert from "./rules/no-widen-then-assert.ts"
import requireReadableSpacing from "./rules/require-readable-spacing.ts"
import requireSafetyCommentForTypeAssertion from "./rules/require-safety-comment-for-type-assertion.ts"

interface AntiSlopPlugin extends Plugin {
  readonly rules: {
    readonly "no-array-filter-map": Rule
    readonly "no-chained-type-assertions": Rule
    readonly "no-conditional-empty-object-spread": Rule
    readonly "no-known-value-widening": Rule
    readonly "no-module-mocking": Rule
    readonly "no-object-parameters": Rule
    readonly "no-reduce-accumulator-copy": Rule
    readonly "no-reflect-apply": Rule
    readonly "no-reflect-get": Rule
    readonly "no-runtime-typeof": Rule
    readonly "no-shape-in-symbol-names": Rule
    readonly "no-unknown-parameters": Rule
    readonly "no-unknown-returns": Rule
    readonly "no-unknown-type-aliases": Rule
    readonly "no-unsafe-dictionary-type": Rule
    readonly "no-widen-then-assert": Rule
    readonly "require-readable-spacing": Rule
    readonly "require-safety-comment-for-type-assertion": Rule
  }
}

/**
 * The antislop rules that the strict preset enables. They started as a copy of
 * https://github.com/dmmulroy/anti-slop. Adamantite uses the `antislop` namespace. Doctor reports
 * old rule names for migration. See license.md.
 */
const plugin: AntiSlopPlugin = {
  meta: { name: "antislop" },
  rules: {
    "no-array-filter-map": noArrayFilterMap,
    "no-chained-type-assertions": noChainedTypeAssertions,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpread,
    "no-known-value-widening": noKnownValueWidening,
    "no-module-mocking": noModuleMocking,
    "no-object-parameters": noObjectParameters,
    "no-reduce-accumulator-copy": noReduceAccumulatorCopy,
    "no-reflect-apply": noReflectApply,
    "no-reflect-get": noReflectGet,
    "no-runtime-typeof": noRuntimeTypeof,
    "no-shape-in-symbol-names": noForbiddenTermInSymbolNames,
    "no-unknown-parameters": noUnknownParameters,
    "no-unknown-returns": noUnknownReturns,
    "no-unknown-type-aliases": noUnknownTypeAliases,
    "no-unsafe-dictionary-type": noUnsafeDictionaryType,
    "no-widen-then-assert": noWidenThenAssert,
    "require-readable-spacing": requireReadableSpacing,
    "require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertion,
  },
}

export default plugin
