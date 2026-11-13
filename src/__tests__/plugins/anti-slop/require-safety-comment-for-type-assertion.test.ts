import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "missingSafetyComment" }

tester.run(
  "anti-slop/require-safety-comment-for-type-assertion (custom markers)",
  plugin.rules["require-safety-comment-for-type-assertion"],
  {
    invalid: [
      {
        code: "// SAFETY: This marker is not configured.\nconst value = input as User;",
        errors: [error],
        options: [{ markers: ["INVARIANT"] }],
      },
      {
        code: "// INVARIANT:   \nconst value = input as User;",
        errors: [error],
        options: [{ markers: ["INVARIANT"] }],
      },
    ],
    valid: [
      {
        code: "// INVARIANT: The caller parsed this value.\nconst value = input as User;",
        options: [{ markers: ["INVARIANT"] }],
      },
      {
        code: "// SAFETY: The caller parsed this value.\nconst value = input as User;",
        options: [{ markers: ["INVARIANT", "SAFETY"] }],
      },
      {
        code: "// SAFE+: The caller parsed this value.\nconst value = input as User;",
        options: [{ markers: ["SAFE+"] }],
      },
      {
        code: "// INVARIANT: The caller parsed this value.\nconst value = input as User;",
        name: "marker with outer spaces",
        options: [{ markers: [" INVARIANT "] }],
      },
    ],
  }
)

tester.run(
  "anti-slop/require-safety-comment-for-type-assertion",
  plugin.rules["require-safety-comment-for-type-assertion"],
  {
    invalid: [
      { code: "const id = value as UserId;", errors: [error] },
      { code: "const id = <UserId>value;", errors: [error] },
      { code: "const id = value as UserId; // SAFETY: Too late.", errors: [error] },
      {
        code: "// This cast seems fine.\nconst id = value as UserId;",
        errors: [error],
      },
      { code: "// SAFETY:\nconst id = value as UserId;", errors: [error] },
      { code: "// SAFETY:   \nconst id = value as UserId;", errors: [error] },
      { code: "const id = /* SAFETY: */ value as UserId;", errors: [error] },
      { code: "export const id = value as UserId;", errors: [error] },
      {
        code: "// This is not a safety justification.\nexport const id = value as UserId;",
        errors: [error],
      },
      {
        code: "// SAFETY: The test owns this input.\nit('reads', () => {\n  if (value as boolean) run();\n});",
        errors: [error],
        name: "comment above a call does not cover an if header inside it",
      },
      {
        code: "// SAFETY: The parser established the invariant.\nfunction read() {\n  for (const item of value as Item[]) use(item);\n}",
        errors: [error],
        name: "comment above a function does not cover a for header inside it",
      },
      {
        code: "// SAFETY: The test owns this input.\nit('reads', () => {\n  while (value as boolean) run();\n});",
        errors: [error],
        name: "comment above a call does not cover a while header inside it",
      },
      {
        code: "// SAFETY: The test owns this input.\nit('reads', () => {\n  switch (value as Kind) {}\n});",
        errors: [error],
        name: "comment above a call does not cover a switch header inside it",
      },
      {
        code: "export const first = 1 // SAFETY: first is a literal.\nexport const id = value as UserId;",
        errors: [error],
        name: "trailing comment of the previous line",
      },
      {
        code: "const first = 1; /* SAFETY: first is a literal. */\nconst id = value as UserId;",
        errors: [error],
        name: "trailing block comment of the previous line",
      },
    ],
    valid: [
      "const values = [1, 2] as const;",
      "const value = <const>{ id: 'one' };",
      "// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
      "function parse(): UserId {\n// SAFETY: Validation above established the UserId invariant.\nreturn value as UserId;\n}",
      "const id = /* SAFETY: Validation established the invariant. */ value as UserId;",
      "// SAFETY: The parser established the exported UserId invariant.\nexport const id = value as UserId;",
      "/* SAFETY:\n * The parser established the exported UserId invariant.\n */\nexport const id = value as UserId;",
      {
        code: "it('reads', () => {\n  // SAFETY: The test owns this input.\n  if (value as boolean) run();\n});",
        name: "comment directly above an if header",
      },
      {
        code: "// SAFETY: The parser established the invariant.\nfor (let index = value as number; index > 0; index -= 1) use(index);",
        name: "comment above a for statement covers its initializer",
      },
      {
        code: "const first = 1;\n// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
        name: "comment on its own line after another statement",
      },
    ],
  }
)
