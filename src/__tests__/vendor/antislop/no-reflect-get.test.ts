import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-reflect-get", antislop.rules["no-reflect-get"], {
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
