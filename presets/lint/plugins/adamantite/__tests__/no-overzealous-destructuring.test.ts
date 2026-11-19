import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/adamantite/index.ts"

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
      name: "report an object pattern three levels deep",
    },
    {
      code: "const [{ user: [first] }] = rows",
      errors: [{ column: 15, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
      name: "report an array pattern three levels deep",
    },
    {
      code: "function Card({ user: { profile: { name } = {} } }) {\n  return name\n}",
      errors: [{ column: 33, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
      name: "report a parameter pattern three levels deep",
    },
    {
      code: "const { a: { b: { c: { d } } } } = value",
      errors: [{ column: 16, data: { depth: "3", maxDepth: "2" }, line: 1, messageId: "tooDeep" }],
      name: "report only the first level past the limit",
    },
    {
      code: "let rest\n;({ a: { b: [...rest] } } = value)",
      errors: [{ column: 12, data: { depth: "3", maxDepth: "2" }, line: 2, messageId: "tooDeep" }],
      name: "report a rest element three levels deep in an assignment",
    },
    {
      code: "const { data: { user } } = query",
      errors: [{ column: 14, data: { depth: "2", maxDepth: "1" }, line: 1, messageId: "tooDeep" }],
      name: "report two levels with maxDepth 1",
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
      name: "report six properties",
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
      name: "report six properties in a parameter before a rest element",
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
      name: "report three properties with maxProperties 2",
      options: [{ maxProperties: 2 }],
    },
  ],
  valid: [
    { code: "const { data: { user } } = query", name: "accept an object pattern two levels deep" },
    { code: "const [{ user }] = rows", name: "accept an array pattern two levels deep" },
    {
      code: "const { a, b, c, d, e, ...rest } = value",
      name: "accept five properties and a rest element",
    },
    {
      code: "const [a, b, c, d, e, f, g] = values",
      name: "accept an array pattern with many elements",
    },
    {
      code: "function Card({ user: { name } = {} }) {\n  return name\n}",
      name: "accept a nested parameter pattern with a default",
    },
    {
      code: "for (const [key, { value }] of entries) {\n  console.log(key, value)\n}",
      name: "accept a nested pattern in a for-of loop",
    },
    {
      code: "try {\n  run()\n} catch ({ cause: { message } }) {\n  console.log(message)\n}",
      name: "accept a nested pattern in a catch clause",
    },
    {
      code: "const { a: { b: { c } } } = value",
      name: "accept three levels with maxDepth 3",
      options: [{ maxDepth: 3 }],
    },
    {
      code: "const { a, b, c, d, e, f } = value",
      name: "accept six properties with maxProperties 6",
      options: [{ maxProperties: 6 }],
    },
  ],
})
