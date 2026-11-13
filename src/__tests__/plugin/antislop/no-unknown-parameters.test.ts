import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownParameter" }

tester.run("no-unknown-parameters", plugin.rules["no-unknown-parameters"], {
  valid: [
    "function enrich(cause: unknown): void {}",
    "function enrich(cause: Error | unknown): void {}",
    "function isString(value: unknown): value is string { return true; }",
    "const isString = (value: unknown): value is string => true;",
    "function assertString(value: unknown): asserts value is string {}",
    "type Guard = (value: unknown) => value is string;",
    "declare function isString(value: unknown): value is string;",
    "type Guards = { isString(value: unknown): value is string };",
    "function parse(value: string | number): void {}",
    "task.catch((error: unknown) => String(error));",
    "task.catch(function describe(error: unknown) { return String(error); });",
    "task?.catch((error: unknown) => String(error));",
    "task.then((value) => value, (error: unknown) => String(error));",
  ],
  invalid: [
    { code: "function parse(value: unknown): void {}", errors: [error] },
    { code: "function parse(value: string | unknown): void {}", errors: [error] },
    {
      code: "function parse(value: string | (number | unknown)): void {}",
      errors: [error],
    },
    {
      code: "function isString(value: unknown, context: unknown): value is string { return true; }",
      errors: [{ ...error, data: { parameter: "context" } }],
    },
    {
      code: "task.then((value: unknown) => String(value));",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "task.catch((error: unknown, context: unknown) => String(context));",
      errors: [{ ...error, data: { parameter: "context" } }],
    },
    {
      code: "function describe(error: unknown): string { return String(error); }\ntask.catch(describe);",
      errors: [{ ...error, data: { parameter: "error" } }],
    },
    {
      code: 'task["catch"]((error: unknown) => String(error));',
      errors: [{ ...error, data: { parameter: "error" } }],
    },
    {
      code: "export function parse({ value }: unknown = {}): void {}",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
    },
  ],
})
