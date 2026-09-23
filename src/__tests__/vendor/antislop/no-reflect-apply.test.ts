import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-reflect-apply", antislop.rules["no-reflect-apply"], {
  invalid: [
    {
      code: "declare const operation: () => number\nexport const value = Reflect['apply'](operation, undefined, [])",
      errors: [{ column: 21, line: 2, messageId: "reflectApply" }],
    },
    {
      code: "declare const operation: () => number\nexport const value = Reflect.apply(operation, undefined, [])",
      errors: [{ column: 21, line: 2, messageId: "reflectApply" }],
    },
  ],
  valid: [
    "declare const operation: (...args: number[]) => number\nexport const value = operation.apply(undefined, [1])",
    "const Reflect = { apply() { return 1 } }\nexport const value = Reflect.apply()",
  ],
})
