import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop-effect/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester()

tester.run("prefer-effect-match", plugin.rules["prefer-effect-match"], {
  invalid: [
    {
      code: 'kind === "a" ? first : kind === "b" ? second : fallback;',
      errors: [{ messageId: "preferMatch" }],
    },
    {
      code: "`a` !== kind ? first : `b` === kind ? second : fallback;",
      errors: [{ messageId: "preferMatch" }],
    },
  ],
  valid: [
    'kind === "a" ? first : fallback;',
    'kind === "a" ? first : other === "b" ? second : fallback;',
    "condition ? first : otherCondition ? second : fallback;",
  ],
})
