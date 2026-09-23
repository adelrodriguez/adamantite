import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-widen-then-assert", antislop.rules["no-widen-then-assert"], {
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
