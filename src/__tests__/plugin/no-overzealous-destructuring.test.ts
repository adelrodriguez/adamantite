import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/index.ts"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" }, sourceType: "module" },
})

tester.run("no-overzealous-destructuring", plugin.rules["no-overzealous-destructuring"], {
  invalid: [
    {
      code: "const { data: { user: { name } } } = query",
      errors: [{ column: 22, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
    },
    {
      code: "const [{ user: [first] }] = rows",
      errors: [{ column: 15, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
    },
    {
      code: "function Card({ user: { profile: { name } = {} } }) {\n  return name\n}",
      errors: [{ column: 33, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
    },
    {
      code: "const { a: { b: { c: { d } } } } = value",
      errors: [{ column: 16, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
    },
    {
      code: "let rest\n;({ a: { b: [...rest] } } = value)",
      errors: [{ column: 12, data: { depth: "3", maxDepth: "2" }, line: 2, messageId: "tooDeep" }],
    },
    {
      code: "const { data: { user } } = query",
      errors: [{ column: 14, data: { depth: "2", maxDepth: "1" }, line: 1, messageId: "tooDeep" }],
      options: [{ maxDepth: 1 }],
    },
    {
      code: "const { a, b, c, d, e, f } = value",
      errors: [
        {
          column: 6,
          data: { count: "6", maxProperties: "5" },
          line: 1,
          messageId: "tooManyProperties",
        },
      ],
    },
    {
      code: "export function Button({ a, b, c, d, e, f, ...props }: Props) {\n  return props\n}",
      errors: [
        {
          column: 23,
          data: { count: "6", maxProperties: "5" },
          line: 1,
          messageId: "tooManyProperties",
        },
      ],
    },
    {
      code: "const { a, b, c } = value",
      errors: [
        {
          column: 6,
          data: { count: "3", maxProperties: "2" },
          line: 1,
          messageId: "tooManyProperties",
        },
      ],
      options: [{ maxProperties: 2 }],
    },
  ],
  valid: [
    "const { data: { user } } = query",
    "const [{ user }] = rows",
    "const { a, b, c, d, e, ...rest } = value",
    "const [a, b, c, d, e, f, g] = values",
    "function Card({ user: { name } = {} }) {\n  return name\n}",
    "for (const [key, { value }] of entries) {\n  console.log(key, value)\n}",
    "try {\n  run()\n} catch ({ cause: { message } }) {\n  console.log(message)\n}",
    { code: "const { a: { b: { c } } } = value", options: [{ maxDepth: 3 }] },
    { code: "const { a, b, c, d, e, f } = value", options: [{ maxProperties: 6 }] },
  ],
})
