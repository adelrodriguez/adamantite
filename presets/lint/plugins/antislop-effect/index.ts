import type { Plugin, Rule } from "@oxlint/plugins"
import noManualEffectErrorTag from "./rules/no-manual-effect-error-tag.ts"
import noManualTagComparison from "./rules/no-manual-tag-comparison.ts"
import noManualTaggedConstruction from "./rules/no-manual-tagged-construction.ts"
import noServiceConstructorImports from "./rules/no-service-constructor-imports.ts"
import preferEffectMatch from "./rules/prefer-effect-match.ts"

interface AntiSlopEffectPlugin extends Plugin {
  readonly rules: {
    readonly "no-manual-effect-error-tag": Rule
    readonly "no-manual-tag-comparison": Rule
    readonly "no-manual-tagged-construction": Rule
    readonly "no-service-constructor-imports": Rule
    readonly "prefer-effect-match": Rule
  }
}

/**
 * The antislop-effect rules that the effect preset enables. They started as a copy of the Effect
 * rules of https://github.com/dmmulroy/anti-slop. Adamantite uses the `antislop-effect` namespace.
 * Doctor reports old rule names for migration. See license.md.
 */
const plugin: AntiSlopEffectPlugin = {
  meta: { name: "antislop-effect" },
  rules: {
    "no-manual-effect-error-tag": noManualEffectErrorTag,
    "no-manual-tag-comparison": noManualTagComparison,
    "no-manual-tagged-construction": noManualTaggedConstruction,
    "no-service-constructor-imports": noServiceConstructorImports,
    "prefer-effect-match": preferEffectMatch,
  },
}

export default plugin
