import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-reflect-get", {
  invalid: [
    {
      code: "declare const owner: { property: string }\nexport const value = Reflect['get'](owner, 'property')",
      errors: [{ column: 21, line: 2, messageId: "reflectGet" }],
    },
    {
      code: "declare const owner: { property: string }\nexport const value = Reflect.get(owner, 'property')",
      errors: [{ column: 21, line: 2, messageId: "reflectGet" }],
    },
  ],
  valid: [
    "const Reflect = { get() { return 1 } }\nexport const value = Reflect.get()",
    "declare const owner: { property: string }\nexport const value = owner.property",
    "declare const owner: { property: string }\nReflect.set(owner, 'property', 'next')",
  ],
})
