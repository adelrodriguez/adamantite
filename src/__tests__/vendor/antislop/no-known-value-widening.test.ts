import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

const COMMAND = "type Command = () => void\nconst startCommand: Command = () => {}\n"
const IS_STRING = "function isString(value: unknown): value is string {\n  return true\n}\n"

testVendoredRule(antislop, "no-known-value-widening", {
  invalid: [
    {
      code: `${COMMAND}type Index<T> = Record<string, T>\nexport const commands: Index<Command> = { start: startCommand }`,
      errors: [
        {
          column: 40,
          data: { subject: "binding `commands`", target: "generic container" },
          line: 4,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${IS_STRING}export const result = isString('known')`,
      errors: [
        {
          column: 31,
          data: { subject: "argument for parameter `value` of `isString`", target: "unknown" },
          line: 4,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${IS_STRING}export function check(known: string): boolean {\n  return isString(known)\n}`,
      errors: [
        {
          column: 18,
          data: { subject: "argument for parameter `value` of `isString`", target: "unknown" },
          line: 5,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${COMMAND}export const commands: { [key: string]: Command } = { start: startCommand }`,
      errors: [
        {
          column: 52,
          data: { subject: "binding `commands`", target: "open dictionary" },
          line: 3,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${COMMAND}export const commands: { start: Command } = { start: startCommand }`,
      errors: [
        {
          column: 44,
          data: { subject: "binding `commands`", target: "anonymous object" },
          line: 3,
          messageId: "widening",
        },
      ],
    },
    {
      code: "export const value: object = []",
      errors: [
        {
          column: 29,
          data: { subject: "binding `value`", target: "object" },
          line: 1,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${COMMAND}type Open = Record<string, Command>\nconst source = { start: startCommand }\nexport const commands: Open = source`,
      errors: [
        {
          column: 30,
          data: { subject: "binding `commands`", target: "open dictionary" },
          line: 5,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${COMMAND}export const commands: Record<string, Command> = { start: startCommand }`,
      errors: [
        {
          column: 49,
          data: { subject: "binding `commands`", target: "open dictionary" },
          line: 3,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${COMMAND}export const commands = { start: startCommand } as Record<string, Command>`,
      errors: [
        {
          column: 24,
          data: { subject: "assertion", target: "open dictionary" },
          line: 3,
          messageId: "widening",
        },
      ],
    },
    {
      code: `${COMMAND}export function create(): Record<string, Command> {\n  return { start: startCommand }\n}`,
      errors: [
        {
          column: 9,
          data: { subject: "return value of `create`", target: "open dictionary" },
          line: 4,
          messageId: "widening",
        },
      ],
    },
    {
      code: "export const value: unknown = {}",
      errors: [
        {
          column: 30,
          data: { subject: "binding `value`", target: "unknown" },
          line: 1,
          messageId: "widening",
        },
      ],
    },
    {
      code: "export function create(): unknown {\n  return {}\n}",
      errors: [
        {
          column: 9,
          data: { subject: "return value of `create`", target: "unknown" },
          line: 2,
          messageId: "widening",
        },
      ],
    },
  ],
  valid: [
    `${COMMAND}interface Commands { readonly start: Command }\nexport const commands: Commands = { start: startCommand }`,
    `${COMMAND}export const commands: Record<string, Command> = {}`,
    "type Diet = 'vegan' | 'omnivore'\nexport const labels: Record<Diet, string> = { vegan: 'V', omnivore: 'O' }",
    `${IS_STRING}declare const input: unknown\nexport const result = isString(input)`,
    `${COMMAND}export const commands = { start: startCommand }`,
    `${COMMAND}export const commands = { start: startCommand } satisfies Record<string, Command>`,
  ],
})
