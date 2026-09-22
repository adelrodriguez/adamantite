import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-conditional-empty-object-spread", {
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
})
