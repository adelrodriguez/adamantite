import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("prefer-effect-match", plugin.rules["prefer-effect-match"], {
  invalid: [
    {
      code: 'kind === "a" ? first : kind === "b" ? second : fallback;',
      errors: [{ messageId: "preferMatch" }],
      name: "report a ternary chain that compares one value with string literals",
    },
    {
      code: "`a` !== kind ? first : `b` === kind ? second : fallback;",
      errors: [{ messageId: "preferMatch" }],
      name: "report a chain that compares template literals on the left with either operator",
    },
  ],
  valid: [
    { code: 'kind === "a" ? first : fallback;', name: "accept a single ternary" },
    {
      code: 'kind === "a" ? first : other === "b" ? second : fallback;',
      name: "accept a chain that compares different values",
    },
    {
      code: "condition ? first : otherCondition ? second : fallback;",
      name: "accept a chain of conditions that compare no value",
    },
  ],
})
