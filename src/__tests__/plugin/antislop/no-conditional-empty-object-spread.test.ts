import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "avoid" }

if (plugin.rules["no-conditional-empty-object-spread"].meta?.fixable !== undefined) {
  throw new Error("The rule must not offer an unsafe semantics-changing fix.")
}

tester.run(
  "anti-slop/no-conditional-empty-object-spread",
  plugin.rules["no-conditional-empty-object-spread"],
  {
    invalid: [
      {
        code: "const result = { ...(value !== undefined ? { value } : {}) };",
        errors: [error],
      },
      {
        code: "const result = { ...(condition ? {} : { value }) };",
        errors: [error],
      },
    ],
    valid: [
      "const result = { value };",
      "const result = { ...values };",
      "const result = condition ? { value } : {};",
    ],
  }
)
