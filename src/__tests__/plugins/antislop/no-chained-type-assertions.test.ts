import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "chained" }

tester.run("no-chained-type-assertions", plugin.rules["no-chained-type-assertions"], {
  invalid: [
    { code: "const value = input as unknown as User;", errors: [error], name: "as chain" },
    {
      code: 'parsePort("abc" as unknown as number);',
      errors: [/`\/\/ @ts-expect-error -- reason`/u],
      name: "invalid input on purpose names the expect-error escape",
    },
    {
      code: "const value = (input as unknown) as User;",
      errors: [error],
      name: "parenthesized chain",
    },
    {
      code: "const value = <User>(<unknown>input);",
      errors: [error],
      name: "angle-bracket chain",
    },
    {
      code: "const value = ({ id: 1 } as const) as User;",
      errors: [error],
      name: "mixed const chain",
    },
    {
      code: "const value = (input as unknown satisfies unknown) as number;",
      errors: [error],
      name: "chain through a parenthesized satisfies",
    },
    {
      code: "const value = input as unknown satisfies unknown as number;",
      errors: [error],
      name: "chain through a satisfies without parentheses",
    },
    {
      code: "const value = <number>(<unknown>input satisfies unknown);",
      errors: [error],
      name: "angle-bracket chain through a satisfies",
    },
    {
      code: "const value = ((input as unknown) satisfies unknown satisfies unknown) as number;",
      errors: [error],
      name: "chain through nested satisfies",
    },
  ],
  valid: [
    "const value = input as User;",
    "const value = (input as User);",
    "const value = ({ id: 1 } as const) as const;",
    {
      code: "const value = (input satisfies User) as User;",
      name: "one assertion after a satisfies",
    },
    {
      code: "const value = (input as User) satisfies User;",
      name: "satisfies after one assertion",
    },
    {
      code: "const value = ({ id: 1 } as const satisfies User) as const;",
      name: "const chain through a satisfies",
    },
  ],
})
