import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-widen-then-assert", {
  invalid: [
    {
      code: "const source = { id: 'second' }\nconst widened: unknown = source\nexport const parsed = widened as { readonly id: string }",
      errors: [{ column: 22, data: { name: "widened" }, line: 3, messageId: "widenThenAssert" }],
    },
  ],
  valid: [
    "declare const input: unknown\n// SAFETY: Fixture input.\nexport const parsed = input as { readonly id: string }",
    "const source = { id: 'first' }\nexport const widened: unknown = source",
  ],
})
