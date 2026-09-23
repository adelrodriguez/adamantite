import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run(
  "no-conditional-empty-object-spread",
  antislop.rules["no-conditional-empty-object-spread"],
  {
    invalid: [
      {
        code: "declare const value: string | undefined\nexport const result = { ...(value !== undefined ? { value } : {}) }",
        errors: [{ column: 24, line: 2, messageId: "avoid" }],
      },
      {
        code: "declare const condition: boolean\ndeclare const value: string\nexport const result = { ...(condition ? {} : { value }) }",
        errors: [{ column: 24, line: 3, messageId: "avoid" }],
      },
    ],
    valid: [
      "declare const condition: boolean\ndeclare const value: string\nexport const result = condition ? { value } : {}",
      "declare const value: string\nexport const result = { value }",
      "declare const values: { id: string }\nexport const result = { ...values }",
    ],
  }
)
