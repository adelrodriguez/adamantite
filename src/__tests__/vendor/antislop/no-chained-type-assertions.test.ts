import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-chained-type-assertions", {
  invalid: [
    {
      code: "declare const input: number\nexport const value = <string>(<unknown>input)",
      errors: [{ column: 21, line: 2, messageId: "chained" }],
    },
    {
      code: "declare const input: number\nexport const value = input as unknown as string",
      errors: [{ column: 21, line: 2, messageId: "chained" }],
    },
    {
      code: "interface User { id: number }\nexport const value = ({ id: 1 } as const) as User",
      errors: [{ column: 21, line: 2, messageId: "chained" }],
    },
    {
      code: "declare const input: number\nexport const value = (input as unknown) as string",
      errors: [{ column: 21, line: 2, messageId: "chained" }],
    },
  ],
  valid: [
    "export const value = ({ id: 1 } as const) as const",
    "declare const input: unknown\n// SAFETY: Fixture input.\nexport const value = input as string",
  ],
})
