import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

tester.run("no-unknown-parameters", antislop.rules["no-unknown-parameters"], {
  invalid: [
    {
      code: "export function parse({ value }: unknown = {}): void {}",
      errors: [
        { column: 33, data: { parameter: "{ value }" }, line: 1, messageId: "unknownParameter" },
      ],
    },
    {
      code: "export function parse(value: string | (number | unknown)): void {}",
      errors: [
        { column: 29, data: { parameter: "value" }, line: 1, messageId: "unknownParameter" },
      ],
    },
    {
      code: "export function isString(value: unknown, context: unknown): value is string {\n  return true\n}",
      errors: [
        { column: 50, data: { parameter: "context" }, line: 1, messageId: "unknownParameter" },
      ],
    },
    {
      code: "export function parse(value: string | unknown): void {}",
      errors: [
        { column: 29, data: { parameter: "value" }, line: 1, messageId: "unknownParameter" },
      ],
    },
    {
      code: "export function parse(value: unknown): void {}",
      errors: [
        { column: 29, data: { parameter: "value" }, line: 1, messageId: "unknownParameter" },
      ],
    },
  ],
  valid: [
    "export function assertString(value: unknown): asserts value is string {}",
    "export function enrich(cause: unknown): void {}",
    "export function parse(value: string | number): void {}",
    "export type Guard = (value: unknown) => value is string",
    "export function isString(value: unknown): value is string {\n  return true\n}",
  ],
})
