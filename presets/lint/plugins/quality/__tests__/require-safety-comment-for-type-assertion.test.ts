import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "missingSafetyComment" }

tester.run(
  "quality/require-safety-comment-for-type-assertion (custom markers)",
  plugin.rules["require-safety-comment-for-type-assertion"],
  {
    invalid: [
      {
        code: "// SAFETY: This marker is not configured.\nconst value = input as User;",
        errors: [error],
        name: "report the default marker when the markers option replaces it",
        options: [{ markers: ["INVARIANT"] }],
      },
      {
        code: "// INVARIANT:   \nconst value = input as User;",
        errors: [error],
        name: "report a custom marker without a reason",
        options: [{ markers: ["INVARIANT"] }],
      },
    ],
    valid: [
      {
        code: "// INVARIANT: The caller parsed this value.\nconst value = input as User;",
        name: "accept a custom marker",
        options: [{ markers: ["INVARIANT"] }],
      },
      {
        code: "// SAFETY: The caller parsed this value.\nconst value = input as User;",
        name: "accept the second of two custom markers",
        options: [{ markers: ["INVARIANT", "SAFETY"] }],
      },
      {
        code: "// SAFE+: The caller parsed this value.\nconst value = input as User;",
        name: "accept a custom marker with regular expression syntax",
        options: [{ markers: ["SAFE+"] }],
      },
      {
        code: "// INVARIANT: The caller parsed this value.\nconst value = input as User;",
        name: "accept a custom marker with outer spaces",
        options: [{ markers: [" INVARIANT "] }],
      },
    ],
  }
)

tester.run(
  "quality/require-safety-comment-for-type-assertion",
  plugin.rules["require-safety-comment-for-type-assertion"],
  {
    invalid: [
      {
        code: "const id = value as UserId;",
        errors: [error],
        name: "report an as assertion without a comment",
      },
      {
        code: "const id = <UserId>value;",
        errors: [error],
        name: "report an angle-bracket assertion without a comment",
      },
      {
        code: "const id = value as UserId; // SAFETY: Too late.",
        errors: [error],
        name: "report a SAFETY comment after the assertion",
      },
      {
        code: "// This cast seems fine.\nconst id = value as UserId;",
        errors: [error],
        name: "report a comment without the marker",
      },
      {
        code: "// SAFETY:\nconst id = value as UserId;",
        errors: [error],
        name: "report a marker without a reason",
      },
      {
        code: "// SAFETY:   \nconst id = value as UserId;",
        errors: [error],
        name: "report a marker followed by spaces only",
      },
      {
        code: "const id = /* SAFETY: */ value as UserId;",
        errors: [error],
        name: "report an inline marker without a reason",
      },
      {
        code: "export const id = value as UserId;",
        errors: [error],
        name: "report an exported assertion without a comment",
      },
      {
        code: "// This is not a safety justification.\nexport const id = value as UserId;",
        errors: [error],
        name: "report an exported assertion under a comment without the marker",
      },
      {
        code: "// SAFETY: The test owns this input.\nit('reads', () => {\n  if (value as boolean) run();\n});",
        errors: [error],
        name: "report an if header inside a call under a SAFETY comment",
      },
      {
        code: "// SAFETY: The parser established the invariant.\nfunction read() {\n  for (const item of value as Item[]) use(item);\n}",
        errors: [error],
        name: "report a for header inside a function under a SAFETY comment",
      },
      {
        code: "// SAFETY: The test owns this input.\nit('reads', () => {\n  while (value as boolean) run();\n});",
        errors: [error],
        name: "report a while header inside a call under a SAFETY comment",
      },
      {
        code: "// SAFETY: The test owns this input.\nit('reads', () => {\n  switch (value as Kind) {}\n});",
        errors: [error],
        name: "report a switch header inside a call under a SAFETY comment",
      },
      {
        code: "export const first = 1 // SAFETY: first is a literal.\nexport const id = value as UserId;",
        errors: [error],
        name: "report a trailing comment of the previous line",
      },
      {
        code: "const first = 1; /* SAFETY: first is a literal. */\nconst id = value as UserId;",
        errors: [error],
        name: "report a trailing block comment of the previous line",
      },
    ],
    valid: [
      { code: "const values = [1, 2] as const;", name: "accept an as const assertion" },
      {
        code: "const value = <const>{ id: 'one' };",
        name: "accept an angle-bracket const assertion",
      },
      {
        code: "// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
        name: "accept a SAFETY comment on the line above",
      },
      {
        code: "function parse(): UserId {\n// SAFETY: Validation above established the UserId invariant.\nreturn value as UserId;\n}",
        name: "accept a SAFETY comment above a return statement",
      },
      {
        code: "const id = /* SAFETY: Validation established the invariant. */ value as UserId;",
        name: "accept an inline SAFETY block comment before the value",
      },
      {
        code: "// SAFETY: The parser established the exported UserId invariant.\nexport const id = value as UserId;",
        name: "accept a SAFETY comment above an exported declaration",
      },
      {
        code: "/* SAFETY:\n * The parser established the exported UserId invariant.\n */\nexport const id = value as UserId;",
        name: "accept a multiline SAFETY block comment above an exported declaration",
      },
      {
        code: "it('reads', () => {\n  // SAFETY: The test owns this input.\n  if (value as boolean) run();\n});",
        name: "accept a comment directly above an if header",
      },
      {
        code: "// SAFETY: The parser established the invariant.\nfor (let index = value as number; index > 0; index -= 1) use(index);",
        name: "accept a comment above a for statement for its initializer",
      },
      {
        code: "const first = 1;\n// SAFETY: The parser established the UserId invariant.\nconst id = value as UserId;",
        name: "accept a comment on its own line after another statement",
      },
    ],
  }
)
