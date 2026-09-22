import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-unsafe-dictionary-type", {
  invalid: [
    {
      code: "export type Dict = Record<string, { readonly __brand?: never }>",
      errors: [
        { column: 19, data: { value: "empty-object" }, line: 1, messageId: "unsafeDictionary" },
      ],
    },
    {
      code: "interface Escape {}\nexport type Dict = Record<string, Escape>",
      errors: [
        { column: 19, data: { value: "empty-object" }, line: 2, messageId: "unsafeDictionary" },
      ],
    },
    {
      code: "type Index<T = unknown> = Record<string, T>\nexport type Dict = Index",
      errors: [{ column: 19, data: { value: "unknown" }, line: 2, messageId: "unsafeDictionary" }],
    },
    {
      code: "export type Dict = { [key: string]: any }",
      errors: [{ column: 19, data: { value: "any" }, line: 1, messageId: "unsafeDictionary" }],
    },
    {
      code: "export interface Dict { [key: string]: unknown }",
      errors: [{ column: 24, data: { value: "unknown" }, line: 1, messageId: "unsafeDictionary" }],
    },
    {
      code: "export type Dict = { [K in PropertyKey]: object }",
      errors: [{ column: 19, data: { value: "object" }, line: 1, messageId: "unsafeDictionary" }],
    },
    {
      code: "export type Dict = Record<string, NonNullable<unknown>>",
      errors: [{ column: 19, data: { value: "unknown" }, line: 1, messageId: "unsafeDictionary" }],
    },
    {
      code: "export type Dict = Readonly<Record<string, unknown>>",
      errors: [{ column: 19, data: { value: "unknown" }, line: 1, messageId: "unsafeDictionary" }],
    },
    {
      code: "export type Dict = Record<string, {}>",
      errors: [
        { column: 19, data: { value: "empty-object" }, line: 1, messageId: "unsafeDictionary" },
      ],
    },
    {
      code: "export type Dict = Record<string, unknown>",
      errors: [{ column: 19, data: { value: "unknown" }, line: 1, messageId: "unsafeDictionary" }],
    },
    {
      code: "export type Dict = Record<string, string | unknown>",
      errors: [{ column: 19, data: { value: "union" }, line: 1, messageId: "unsafeDictionary" }],
    },
  ],
  valid: [
    "type Command = () => void\nexport type Indexed = { [key: string]: Command }",
    "type Command = () => void\nexport type Commands = Record<string, Command>",
    "export function run<T extends Record<string, unknown>>(input: T): T {\n  return input\n}",
    "type Record<K, V> = { key: K; value: V }\nexport type Entry = Record<string, unknown>",
    "export type Cache = Map<string, unknown>",
    "export type Allowed = Record<string, { payload: unknown }>",
  ],
})
