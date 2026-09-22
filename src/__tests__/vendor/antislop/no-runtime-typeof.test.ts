import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

const ALLOW_IN_TYPE_GUARDS = [{ allowInTypeGuards: true }]
const TYPE_GUARD_FUNCTION =
  "export function isString(value: unknown): value is string {\n  return typeof value === 'string'\n}"
const TYPE_GUARD_ARROW =
  "export const isString = (value: unknown): value is string => typeof value === 'string'"
const ASSERTION_FUNCTION =
  "export function assertString(value: unknown): asserts value is string {\n  if (typeof value !== 'string') throw new Error('not a string')\n}"

testVendoredRule(antislop, "no-runtime-typeof", {
  invalid: [
    {
      code: TYPE_GUARD_FUNCTION,
      errors: [{ column: 9, line: 2, messageId: "runtimeTypeof" }],
    },
    {
      code: TYPE_GUARD_ARROW,
      errors: [{ column: 61, line: 1, messageId: "runtimeTypeof" }],
    },
    {
      code: "export function isString(value: unknown): value is string {\n  const check = () => typeof value === 'string'\n  return check()\n}",
      errors: [{ column: 22, line: 2, messageId: "runtimeTypeof" }],
      options: ALLOW_IN_TYPE_GUARDS,
    },
    {
      code: "export function parse(value: string | number): string {\n  if (typeof value !== 'string') throw new Error('not a string')\n  return value\n}",
      errors: [{ column: 6, line: 2, messageId: "runtimeTypeof" }],
      options: ALLOW_IN_TYPE_GUARDS,
    },
    {
      code: "declare const input: string | number\nexport const isText = typeof input === 'string'",
      errors: [{ column: 22, line: 2, messageId: "runtimeTypeof" }],
      options: ALLOW_IN_TYPE_GUARDS,
    },
    {
      code: "declare const input: string | undefined\nexport const isMissing = typeof input === undefined",
      errors: [{ column: 25, line: 2, messageId: "runtimeTypeof" }],
      options: ALLOW_IN_TYPE_GUARDS,
    },
  ],
  valid: [
    "export const isServer = typeof document === 'undefined'",
    "export const missing = 'undefined' === typeof process",
    { code: ASSERTION_FUNCTION, options: ALLOW_IN_TYPE_GUARDS },
    { code: TYPE_GUARD_ARROW, options: ALLOW_IN_TYPE_GUARDS },
    { code: TYPE_GUARD_FUNCTION, options: ALLOW_IN_TYPE_GUARDS },
  ],
})
