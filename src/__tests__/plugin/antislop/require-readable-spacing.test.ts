import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"
import createPaddingLineRule from "#presets/lint/plugin/antislop/stylistic/padding-line-between-statements.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "expectedBlankLine" }

tester.run("require-readable-spacing", plugin.rules["require-readable-spacing"], {
  invalid: [
    {
      code: "const a = 1;\n/** B docs. */\nconst b = 2;",
      errors: [error],
      output: "const a = 1;\n\n/** B docs. */\nconst b = 2;",
    },
    {
      code: "const a = 1;\n// b\nconst b = 2;",
      errors: [error],
      output: "const a = 1;\n\n// b\nconst b = 2;",
    },
    {
      code: "const a = 1;\nconst b = {\n};\nconst c = 3;",
      errors: [error, error],
      output: "const a = 1;\n\nconst b = {\n};\n\nconst c = 3;",
    },
    { code: "const a = 1;\nfoo(a);", errors: [error], output: "const a = 1;\n\nfoo(a);" },
    {
      code: "export const a = 1;\n/** B docs. */\nexport type B = number;",
      errors: [error],
      output: "export const a = 1;\n\n/** B docs. */\nexport type B = number;",
    },
    {
      code: "const a = 1; // trailing\n// leading\nconst b = 2;",
      errors: [error],
      output: "const a = 1; // trailing\n\n// leading\nconst b = 2;",
    },
    { code: "const a = 1; foo(a);", errors: [error], output: "const a = 1;\n\n foo(a);" },
    {
      code: "import { a } from 'a';\nconst b = a;",
      errors: [error],
      output: "import { a } from 'a';\n\nconst b = a;",
    },
    {
      code: "function f() {\nconst a = 1;\nreturn a;\n}",
      errors: [error],
      output: "function f() {\nconst a = 1;\n\nreturn a;\n}",
    },
    {
      code: "function f() {\nconst a = 1;\nif (a) go();\n}",
      errors: [error],
      output: "function f() {\nconst a = 1;\n\nif (a) go();\n}",
    },
    {
      code: "function f() {\nif (ok) { go(); }\nstop();\n}",
      errors: [error],
      output: "function f() {\nif (ok) { go(); }\n\nstop();\n}",
    },
    {
      code: "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\nconst dispatch = Effect.fn('dispatch')(function* () {\nyield* a;\n});\nreturn dispatch;\n});",
      errors: [error, error],
      output:
        "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\n\nconst dispatch = Effect.fn('dispatch')(function* () {\nyield* a;\n});\n\nreturn dispatch;\n});",
    },
    {
      code: "export interface A {}\nexport class B {}",
      errors: [error],
      output: "export interface A {}\n\nexport class B {}",
    },
    {
      code: "const a = 1\n;[1].forEach(f)",
      errors: [error],
      output: "const a = 1\n\n;[1].forEach(f)",
    },
    {
      code: "const a = 1\nconst b = 2\n;[a, b].forEach(f)",
      errors: [error],
      output: "const a = 1\nconst b = 2\n\n;[a, b].forEach(f)",
    },
    {
      code: "function f() {\nconst a = 1\nconst b = 2\nconst c = {\n}\n;[a, b, c].forEach(f)\n}",
      errors: [error, error],
      output:
        "function f() {\nconst a = 1\nconst b = 2\n\nconst c = {\n}\n\n;[a, b, c].forEach(f)\n}",
    },
    {
      code: "function f() {\nfoo();\nwhile (ok) go();\n}",
      errors: [error],
      output: "function f() {\nfoo();\n\nwhile (ok) go();\n}",
    },
  ],
  valid: [
    "import { a } from 'a';\nimport { b } from 'b';\n\nexport const c = a + b;",
    "function f() {\nconst a = 1;\nconst b = 2;\n\nreturn a + b;\n}",
    "function f() { return 1; }",
    "function f(a: string): string;\nfunction f(a: number): number;\nfunction f(a: string | number) { return a; }",
    "export function f(a: string): string;\nexport function f(a: number): number;\nexport function f(a: string | number) { return a; }",
    "const f = Effect.gen(function* () {\nconst a = yield* A;\nconst b = yield* B;\n\nreturn a + b;\n});",
    "export type A = string;\n\n/** B documentation. */\nexport type B = number;",
    "function f() { if (ok) { go(); } else { stop(); } }",
    "function f() {\n// return docs\nreturn 1;\n}",
    "const a = 1;\n\n\nconst b = 2;",
    "switch (x) { case 1: case 2: go(); break; default: stop(); }",
    "const a = 1;\nconst b = 2;",
    "export const a = 1;\nexport const b = 2;",
    "const a = 1;\nlet b = 2;\nvar c = 3;",
    "function f() {\nconst a = 1;\nusing b = open();\n\nreturn a;\n}",
    "const a = 1;\nconst b = 2;\n\nconst c = 3;",
    "const a = 1; // trailing\nconst b = 2;",
    "/** Heads a group. */\nconst a = 1;\nconst b = 2;",
    "import { a } from 'a';\n\nconst b = a;\nexport const c = b;",
    // The ASI-guard semicolon belongs to the line of the next statement, so `b` is one line long.
    "function f() {\nconst a = 1\nconst b = 2\n;[a, b].forEach(f)\n}",
    "function f() {\nconst a = 1\nconst b = 2\n;(a + b).toFixed()\n}",
    "const a = 1\nconst b = 2\n\n;[a, b].forEach(f)",
  ],
})

// Exercise upstream options that the opinionated public rule does not enable.
tester.run(
  "vendored padding removal",
  createPaddingLineRule([{ blankLine: "never", next: "*", prev: "*" }]),
  {
    invalid: [
      {
        code: "foo();\n\nbar();",
        errors: [{ messageId: "unexpectedBlankLine" }],
        output: "foo();\nbar();",
      },
      {
        code: "foo();\n\n// comment\n\nbar();",
        errors: [{ messageId: "unexpectedBlankLine" }],
        output: null,
      },
    ],
    valid: ["foo();\nbar();"],
  }
)
