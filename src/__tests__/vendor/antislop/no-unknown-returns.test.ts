import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-unknown-returns", antislop.rules["no-unknown-returns"], {
  invalid: [
    {
      code: "declare const input: string\nexport const load = (): unknown => input",
      errors: [{ column: 24, line: 2, messageId: "unknownReturn" }],
    },
    {
      code: "declare const input: string\nexport function load(): unknown {\n  return input\n}",
      errors: [{ column: 24, line: 2, messageId: "unknownReturn" }],
    },
    {
      code: "export type Loader = () => unknown",
      errors: [{ column: 27, line: 1, messageId: "unknownReturn" }],
    },
    {
      code: "type Identity<T> = T\ndeclare const input: string\nexport function load(): Identity<unknown> {\n  return input\n}",
      errors: [{ column: 24, line: 3, messageId: "unknownReturn" }],
    },
    {
      code: "export interface Loader { load(): unknown }",
      errors: [{ column: 34, line: 1, messageId: "unknownReturn" }],
    },
    {
      code: "declare const promise: Promise<string>\nexport function load(): Promise<unknown> {\n  return promise\n}",
      errors: [{ column: 24, line: 2, messageId: "unknownReturn" }],
    },
    {
      code: "type UnknownValue = unknown\ndeclare const input: string\nexport function load(): UnknownValue {\n  return input\n}",
      errors: [{ column: 24, line: 3, messageId: "unknownReturn" }],
    },
    {
      code: "declare const input: string\nexport function load(): string | unknown {\n  return input\n}",
      errors: [{ column: 24, line: 2, messageId: "unknownReturn" }],
    },
  ],
  valid: [
    "export function generic<Value>(value: Value): Value {\n  return value\n}",
    "declare const input: string\nexport function infer() {\n  return input\n}",
    "interface User { id: string }\ndeclare const user: User\nexport function load(): User {\n  return user\n}",
    "declare const input: string\nexport function cause(): { cause: unknown } {\n  return { cause: input }\n}",
  ],
})
