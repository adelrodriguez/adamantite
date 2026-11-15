import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as upstream from "@oxlint/plugins"
import type { CustomRulesOptions } from "#presets/rules/index.ts"
import type { Context, ESTree, Plugin, Rule, RuleOptionsSchema } from "#presets/rules/plugin.ts"
import * as rules from "#presets/rules/index.ts"
import * as plugin from "#presets/rules/plugin.ts"

describe("rules/plugin", () => {
  it("expose the pinned Oxlint helpers separately from the rules-folder preset", () => {
    expect(plugin).toMatchObject(upstream)
    expect(Object.keys(rules)).toStrictEqual(["default"])
  })

  it("preserve the Oxlint authoring types and visitor types", () => {
    expectTypeOf<typeof plugin>().toEqualTypeOf<typeof upstream>()
    expectTypeOf<Plugin>().toEqualTypeOf<upstream.Plugin>()
    expectTypeOf<RuleOptionsSchema>().toEqualTypeOf<upstream.RuleOptionsSchema>()
    expectTypeOf<CustomRulesOptions>().toEqualTypeOf<
      NonNullable<Parameters<typeof rules.default>[0]>
    >()

    const rule = plugin.defineRule({
      create(context) {
        expectTypeOf(context).toEqualTypeOf<Context>()

        return {
          DebuggerStatement(node) {
            expectTypeOf(node).toEqualTypeOf<ESTree.DebuggerStatement>()
          },
        }
      },
    })

    expectTypeOf(rule).toEqualTypeOf<Rule>()
    expectTypeOf(plugin.definePlugin({ rules: { example: rule } })).toEqualTypeOf<Plugin>()

    // @ts-expect-error - A plugin must supply its rules.
    plugin.definePlugin({ meta: { name: "example" } })
    // @ts-expect-error - A rule must supply create or createOnce.
    plugin.defineRule({ meta: { type: "problem" } })
  })
})
