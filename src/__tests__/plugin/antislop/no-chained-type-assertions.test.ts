import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "chained" }

tester.run("no-chained-type-assertions", plugin.rules["no-chained-type-assertions"], {
  invalid: [
    { code: "const value = input as unknown as User;", errors: [error], name: "as chain" },
    {
      code: "const value = (input as unknown) as User;",
      errors: [error],
      name: "parenthesized chain",
    },
    {
      code: "const value = <User>(<unknown>input);",
      errors: [error],
      name: "angle-bracket chain",
    },
    {
      code: "const value = ({ id: 1 } as const) as User;",
      errors: [error],
      name: "mixed const chain",
    },
  ],
  valid: [
    "const value = input as User;",
    "const value = (input as User);",
    "const value = ({ id: 1 } as const) as const;",
  ],
})
