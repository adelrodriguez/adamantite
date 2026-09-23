import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-unknown-type-aliases", antislop.rules["no-unknown-type-aliases"], {
  invalid: [
    {
      code: "type Identity<T> = T\nexport type Payload = Identity<unknown>",
      errors: [{ column: 12, data: { alias: "Payload" }, line: 2, messageId: "unknownAlias" }],
    },
    {
      code: "export function outer() {\n  type Payload = unknown\n}",
      errors: [{ column: 7, data: { alias: "Payload" }, line: 2, messageId: "unknownAlias" }],
    },
    {
      code: "export type Payload = string | unknown",
      errors: [{ column: 12, data: { alias: "Payload" }, line: 1, messageId: "unknownAlias" }],
    },
    {
      code: "export type Alias = unknown",
      errors: [{ column: 12, data: { alias: "Alias" }, line: 1, messageId: "unknownAlias" }],
    },
  ],
  valid: [
    "type Alias = string\nexport type UserId = Alias",
    "export type User = { readonly id: string }",
    "type Box<T> = { readonly value: T }\nexport type Payload = Box<unknown>",
  ],
})
