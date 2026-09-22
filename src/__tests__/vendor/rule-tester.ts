import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"

/**
 * Rule object as RuleTester runs it. `oxlint/plugins-dev` does not export the type by name.
 */
type VendoredRule = Parameters<RuleTester["run"]>[1]

/**
 * Shape of a bundle's generated `plugin.d.mts`, which keeps every rule opaque.
 */
interface VendoredPlugin {
  readonly rules: {
    readonly [ruleName: string]: { readonly create: (context: never) => object }
  }
}

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

/**
 * Run one rule of a vendored bundle in process through `RuleTester`, so a case can pin the message
 * id, the placeholder data, the report position, and the rule options.
 *
 * The preset-level fixture run in `src/__tests__/presets/rule-fixtures.ts` proves that the bundle
 * loads and that each rule fires through a real Oxlint run. This layer proves the behavior of one
 * rule object. Columns are zero-based, as Oxlint reports them.
 */
export function testVendoredRule(
  plugin: VendoredPlugin,
  ruleName: string,
  tests: RuleTester.TestCases
): void {
  const rule = plugin.rules[ruleName]

  if (rule === undefined) {
    throw new Error(`The vendored plugin has no rule named "${ruleName}".`)
  }

  // SAFETY: The generated declaration keeps vendored rules opaque. The bundle wraps every rule
  // with eslintCompatPlugin, so each one has the `create` method that RuleTester runs.
  tester.run(ruleName, rule as VendoredRule, tests)
}
