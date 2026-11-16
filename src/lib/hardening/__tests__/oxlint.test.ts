import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { splitRuleName } from "#lib/hardening/oxlint.ts"

// A rule name has no slash. A plugin name can have one, as a scoped package does.
const ruleName = Schema.String.check(Schema.isPattern(/^[a-z][\w-]*$/))
const pluginName = Schema.String.check(Schema.isPattern(/^(?:@[a-z][\w-]*\/)?[a-z][\w-]*$/))

describe("splitRuleName", () => {
  it.prop(
    "split a rule at the last slash, so a scoped plugin keeps its scope",
    { name: ruleName, plugin: pluginName },
    ({ name, plugin }) => {
      expect(splitRuleName(`${plugin}/${name}`)).toStrictEqual({ name, plugin })
    }
  )

  it.prop("give a rule without a plugin to eslint", { name: ruleName }, ({ name }) => {
    expect(splitRuleName(name)).toStrictEqual({ name, plugin: "eslint" })
  })
})
