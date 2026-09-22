import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import antislop from "#presets/lint/vendor/antislop/plugin.mjs"

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

const USER_ID = "declare const value: string\ntype UserId = string & { readonly brand: 'UserId' }\n"
const JUSTIFY_MARKER = [{ markers: ["JUSTIFY"] }]

tester.run(
  "require-safety-comment-for-type-assertion",
  antislop.rules["require-safety-comment-for-type-assertion"],
  {
    invalid: [
      {
        code: `${USER_ID}export const id = <UserId>value`,
        errors: [
          { column: 18, data: { marker: "SAFETY" }, line: 3, messageId: "missingSafetyComment" },
        ],
      },
      {
        code: `${USER_ID}export const id = /* SAFETY: */ value as UserId`,
        errors: [
          { column: 32, data: { marker: "SAFETY" }, line: 3, messageId: "missingSafetyComment" },
        ],
      },
      {
        code: `${USER_ID}// SAFETY:\nexport const id = value as UserId`,
        errors: [
          { column: 18, data: { marker: "SAFETY" }, line: 4, messageId: "missingSafetyComment" },
        ],
      },
      {
        code: `${USER_ID}export const id = value as UserId`,
        errors: [
          { column: 18, data: { marker: "SAFETY" }, line: 3, messageId: "missingSafetyComment" },
        ],
      },
      {
        code: `${USER_ID}export const id = value as UserId // SAFETY: Too late.`,
        errors: [
          { column: 18, data: { marker: "SAFETY" }, line: 3, messageId: "missingSafetyComment" },
        ],
      },
      {
        code: `${USER_ID}// This cast seems fine.\nexport const id = value as UserId`,
        errors: [
          { column: 18, data: { marker: "SAFETY" }, line: 4, messageId: "missingSafetyComment" },
        ],
      },
      {
        code: `${USER_ID}// SAFETY: The marker is not the configured one.\nexport const id = value as UserId`,
        errors: [
          { column: 18, data: { marker: "JUSTIFY" }, line: 4, messageId: "missingSafetyComment" },
        ],
        options: JUSTIFY_MARKER,
      },
    ],
    valid: [
      `${USER_ID}export function parse(): UserId {\n  // SAFETY: Validation above established the UserId invariant.\n  return value as UserId\n}`,
      "export const values = [1, 2] as const",
      `${USER_ID}export const id = /* SAFETY: Validation established the invariant. */ value as UserId`,
      `${USER_ID}// SAFETY: The parser established the UserId invariant.\nexport const id = value as UserId`,
      `${USER_ID}/* SAFETY:\n * The parser established the exported UserId invariant.\n */\nexport const id = value as UserId`,
      {
        code: `${USER_ID}// JUSTIFY: The parser established the UserId invariant.\nexport const id = value as UserId`,
        options: JUSTIFY_MARKER,
      },
    ],
  }
)
