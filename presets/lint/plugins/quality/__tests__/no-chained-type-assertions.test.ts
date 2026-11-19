import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "chained" }

tester.run("no-chained-type-assertions", plugin.rules["no-chained-type-assertions"], {
  invalid: [
    {
      code: "const value = input as unknown as User;",
      errors: [error],
      name: "report an as chain",
    },
    {
      code: 'parsePort("abc" as unknown as number);',
      errors: [/`\/\/ @ts-expect-error -- reason`/u],
      name: "report a chain through unknown with a message that names the expect-error escape",
    },
    {
      code: "const value = (input as unknown) as User;",
      errors: [error],
      name: "report a parenthesized chain",
    },
    {
      code: "const value = <User>(<unknown>input);",
      errors: [error],
      name: "report an angle-bracket chain",
    },
    {
      code: "const value = ({ id: 1 } as const) as User;",
      errors: [error],
      name: "report a const assertion followed by a type assertion",
    },
    {
      code: "const value = (input as unknown satisfies unknown) as number;",
      errors: [error],
      name: "report a chain through a parenthesized satisfies",
    },
    {
      code: "const value = input as unknown satisfies unknown as number;",
      errors: [error],
      name: "report a chain through a satisfies without parentheses",
    },
    {
      code: "const value = <number>(<unknown>input satisfies unknown);",
      errors: [error],
      name: "report an angle-bracket chain through a satisfies",
    },
    {
      code: "const value = ((input as unknown) satisfies unknown satisfies unknown) as number;",
      errors: [error],
      name: "report a chain through nested satisfies",
    },
  ],
  valid: [
    { code: "const value = input as User;", name: "accept one assertion" },
    { code: "const value = (input as User);", name: "accept one parenthesized assertion" },
    {
      code: "const value = ({ id: 1 } as const) as const;",
      name: "accept a chain of const assertions",
    },
    {
      code: "const value = (input satisfies User) as User;",
      name: "accept one assertion after a satisfies",
    },
    {
      code: "const value = (input as User) satisfies User;",
      name: "accept a satisfies after one assertion",
    },
    {
      code: "const value = ({ id: 1 } as const satisfies User) as const;",
      name: "accept a const chain through a satisfies",
    },
  ],
})
