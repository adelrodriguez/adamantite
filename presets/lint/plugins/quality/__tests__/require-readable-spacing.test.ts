import { RuleTester } from "oxlint/plugins-dev"
import { describe, expect, it } from "vitest"
import format from "#presets/format.ts"
import plugin from "#presets/lint/plugins/quality/index.ts"
import { DEFAULT_PRINT_WIDTH } from "#presets/lint/plugins/quality/rules/require-readable-spacing.ts"
import createPaddingLineRule from "#presets/lint/plugins/quality/stylistic/padding-line-between-statements.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

// `recursive` fixes each output again until no fix applies, so a case fails when a second fix would
// change the code that the first fix wrote.
const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "ts" } },
  recursive: true,
})

const error = { messageId: "expectedBlankLine" }

function bindingEndingAt(name: string, column: number) {
  const start = `  const ${name} = load("`

  return `${start}${"x".repeat(column - start.length - 2)}")`
}

describe("require-readable-spacing print width", () => {
  it("default to the print width of the format preset", () => {
    expect(DEFAULT_PRINT_WIDTH).toBe(format.printWidth)
  })
})

tester.run("require-readable-spacing", plugin.rules["require-readable-spacing"], {
  invalid: [
    {
      code: "const a = 1;\n/** B docs. */\nconst b = 2;",
      errors: [error],
      name: "report a doc comment without a blank line above it",
      output: "const a = 1;\n\n/** B docs. */\nconst b = 2;",
    },
    {
      code: "const a = 1;\n// b\nconst b = 2;",
      errors: [error],
      name: "report a line comment without a blank line above it",
      output: "const a = 1;\n\n// b\nconst b = 2;",
    },
    {
      code: "const a = 1;\nconst b = {\n};\nconst c = 3;",
      errors: [error, error],
      name: "report a multiline declaration without blank lines around it",
      output: "const a = 1;\n\nconst b = {\n};\n\nconst c = 3;",
    },
    {
      code: "const a = 1;\nfoo(a);",
      errors: [error],
      name: "report a call after a declaration",
      output: "const a = 1;\n\nfoo(a);",
    },
    {
      code: "export const a = 1;\n/** B docs. */\nexport type B = number;",
      errors: [error],
      name: "report a documented exported type after an exported const",
      output: "export const a = 1;\n\n/** B docs. */\nexport type B = number;",
    },
    {
      code: "const a = 1; // trailing\n// leading\nconst b = 2;",
      errors: [error],
      name: "report a leading comment after a trailing comment",
      output: "const a = 1; // trailing\n\n// leading\nconst b = 2;",
    },
    {
      code: "const a = 1; foo(a);",
      errors: [error],
      name: "report two statements on one line",
      output: "const a = 1;\n\n foo(a);",
    },
    {
      code: "import { a } from 'a';\nconst b = a;",
      errors: [error],
      name: "report a declaration right after an import",
      output: "import { a } from 'a';\n\nconst b = a;",
    },
    {
      code: "function f() {\nconst a = 1;\nreturn a;\n}",
      errors: [error],
      name: "report a return right after a declaration",
      output: "function f() {\nconst a = 1;\n\nreturn a;\n}",
    },
    {
      code: "function f() {\nconst a = 1;\nif (a) go();\n}",
      errors: [error],
      name: "report an if right after a declaration",
      output: "function f() {\nconst a = 1;\n\nif (a) go();\n}",
    },
    {
      code: "function f() {\nif (ok) { go(); }\nstop();\n}",
      errors: [error],
      name: "report a statement right after a block",
      output: "function f() {\nif (ok) { go(); }\n\nstop();\n}",
    },
    {
      code: "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\nconst dispatch = Effect.fn('dispatch')(function* () {\nyield* a;\n});\nreturn dispatch;\n});",
      errors: [error, error],
      name: "report an Effect.fn declaration among yield declarations and a return",
      output:
        "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\n\nconst dispatch = Effect.fn('dispatch')(function* () {\nyield* a;\n});\n\nreturn dispatch;\n});",
    },
    {
      code: "export interface A {}\nexport class B {}",
      errors: [error],
      name: "report an exported class right after an exported interface",
      output: "export interface A {}\n\nexport class B {}",
    },
    {
      code: "const a = 1\n;[1].forEach(f)",
      errors: [error],
      name: "report a leading semicolon statement right after a declaration",
      output: "const a = 1\n\n;[1].forEach(f)",
    },
    {
      code: "const a = 1\nconst b = 2\n;[a, b].forEach(f)",
      errors: [error],
      name: "report a leading semicolon statement right after declarations",
      output: "const a = 1\nconst b = 2\n\n;[a, b].forEach(f)",
    },
    {
      code: "function f() {\nconst a = 1\nconst b = 2\nconst c = {\n}\n;[a, b, c].forEach(f)\n}",
      errors: [error, error],
      name: "report a multiline declaration and a leading semicolon statement inside a function",
      output:
        "function f() {\nconst a = 1\nconst b = 2\n\nconst c = {\n}\n\n;[a, b, c].forEach(f)\n}",
    },
    {
      code: "function f() {\nfoo();\nwhile (ok) go();\n}",
      errors: [error],
      name: "report a while right after a call",
      output: "function f() {\nfoo();\n\nwhile (ok) go();\n}",
    },
    // Oxfmt wraps a line that ends past the print width, so the binding counts as multiline.
    {
      code: `function f() {\n  const a = 1\n${bindingEndingAt("b", 110)}\n}`,
      errors: [error],
      name: "report a declaration past the print width after a short declaration",
      output: `function f() {\n  const a = 1\n\n${bindingEndingAt("b", 110)}\n}`,
    },
    {
      code: `function f() {\n  const a = 1\n${bindingEndingAt("b", 101)}\n}`,
      errors: [error],
      name: "report a declaration one column past the print width",
      output: `function f() {\n  const a = 1\n\n${bindingEndingAt("b", 101)}\n}`,
    },
    {
      code: `function f() {\n  const a = 1\n${bindingEndingAt("b", 130)}\n  const c = 3\n}`,
      errors: [error, error],
      name: "report a declaration past the printWidth option with blank lines on both sides",
      options: [{ printWidth: 120 }],
      output: `function f() {\n  const a = 1\n\n${bindingEndingAt("b", 130)}\n\n  const c = 3\n}`,
    },
  ],
  valid: [
    {
      code: "import { a } from 'a';\nimport { b } from 'b';\n\nexport const c = a + b;",
      name: "accept a blank line between imports and code",
    },
    {
      code: "function f() {\nconst a = 1;\nconst b = 2;\n\nreturn a + b;\n}",
      name: "accept a blank line before a return after declarations",
    },
    { code: "function f() { return 1; }", name: "accept a one-line function body" },
    {
      code: "function f(a: string): string;\nfunction f(a: number): number;\nfunction f(a: string | number) { return a; }",
      name: "accept consecutive function overloads",
    },
    {
      code: "export function f(a: string): string;\nexport function f(a: number): number;\nexport function f(a: string | number) { return a; }",
      name: "accept consecutive exported function overloads",
    },
    {
      code: "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\n\nreturn a + b;\n});",
      name: "accept a blank line before a return in an Effect generator",
    },
    {
      code: "export type A = string;\n\n/** B documentation. */\nexport type B = number;",
      name: "accept a blank line before a documented type",
    },
    {
      code: "function f() { if (ok) { go(); } else { stop(); } }",
      name: "accept an if-else on one line",
    },
    {
      code: "function f() {\n// return docs\nreturn 1;\n}",
      name: "accept a comment above the only statement",
    },
    { code: "const a = 1;\n\n\nconst b = 2;", name: "accept more than one blank line" },
    {
      code: "switch (x) { case 1: case 2: go(); break; default: stop(); }",
      name: "accept switch cases without blank lines",
    },
    { code: "const a = 1;\nconst b = 2;", name: "accept consecutive const declarations" },
    {
      code: "export const a = 1;\nexport const b = 2;",
      name: "accept consecutive exported const declarations",
    },
    {
      code: "const a = 1;\nlet b = 2;\nvar c = 3;",
      name: "accept consecutive declarations of different kinds",
    },
    {
      code: "function f() {\nconst a = 1;\nusing b = open();\n\nreturn a;\n}",
      name: "accept a using declaration among declarations",
    },
    {
      code: "const a = 1;\nconst b = 2;\n\nconst c = 3;",
      name: "accept a blank line between two groups of declarations",
    },
    {
      code: "const a = 1; // trailing\nconst b = 2;",
      name: "accept a trailing comment between declarations",
    },
    {
      code: "/** Heads a group. */\nconst a = 1;\nconst b = 2;",
      name: "accept a doc comment above the first declaration",
    },
    {
      code: "import { a } from 'a';\n\nconst b = a;\nexport const c = b;",
      name: "accept declarations after a blank line below imports",
    },
    // The ASI-guard semicolon belongs to the line of the next statement, so `b` is one line long.
    {
      code: "function f() {\nconst a = 1\nconst b = 2\n;[a, b].forEach(f)\n}",
      name: "accept a leading semicolon array statement inside a function after declarations",
    },
    {
      code: "function f() {\nconst a = 1\nconst b = 2\n;(a + b).toFixed()\n}",
      name: "accept a leading semicolon parenthesized statement after declarations",
    },
    {
      code: "const a = 1\nconst b = 2\n\n;[a, b].forEach(f)",
      name: "accept a blank line before a leading semicolon statement",
    },
    {
      code: `function f() {\n  const a = 1\n${bindingEndingAt("b", 100)}\n}`,
      name: "accept a declaration that ends at the print width",
    },
    {
      code: `function f() {\n  const a = 1\n${bindingEndingAt("b", 110)}\n}`,
      name: "accept a declaration past the print width that the printWidth option allows",
      options: [{ printWidth: 120 }],
    },
    {
      code: `function f() {\n${bindingEndingAt("b", 110)}\n}`,
      name: "accept a long declaration that is the only statement",
    },
    // The rule asks for blank lines around a line past the print width. If Oxfmt keeps the line,
    // as for a long template literal, the rule still accepts those blank lines.
    {
      code: `function f() {\n  const a = 1\n\n${bindingEndingAt("b", 110)}\n\n  const c = 3\n}`,
      name: "accept a long declaration with blank lines around it",
    },
  ],
})

tester.run(
  "vendored padding removal",
  createPaddingLineRule([{ blankLine: "never", next: "*", prev: "*" }]),
  {
    invalid: [
      {
        code: "foo();\n\nbar();",
        errors: [{ messageId: "unexpectedBlankLine" }],
        name: "report a blank line between statements",
        output: "foo();\nbar();",
      },
      {
        code: "foo();\n\n// comment\n\nbar();",
        errors: [{ messageId: "unexpectedBlankLine" }],
        name: "report blank lines around a comment without a fix",
        output: null,
      },
    ],
    valid: [{ code: "foo();\nbar();", name: "accept statements without a blank line" }],
  }
)
