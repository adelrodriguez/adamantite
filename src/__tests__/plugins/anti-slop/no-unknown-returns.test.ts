import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownReturn" }

tester.run("no-unknown-returns", plugin.rules["no-unknown-returns"], {
  invalid: [
    { code: "function load(): unknown { return input; }", errors: [error] },
    { code: "const load = (): unknown => input;", errors: [error] },
    { code: "type Loader = () => unknown;", errors: [error] },
    { code: "interface Loader { load(): unknown }", errors: [error] },
    { code: "declare function load(): unknown;", errors: [error] },
    { code: "function load(): string | unknown { return input; }", errors: [error] },
    { code: "function load(): Promise<unknown> { return promise; }", errors: [error] },
    {
      code: "type UnknownValue = unknown; function load(): UnknownValue { return input; }",
      errors: [error],
    },
    {
      code: "type Item = unknown; type Fallback<Input> = Input extends infer Item ? string : () => Item;",
      errors: [error],
    },
    {
      code: "function outer() { type Result = unknown; function load(): Result { return input; } }",
      errors: [error],
    },
    {
      code: "type Identity<T> = T; function load(): Identity<unknown> { return input; }",
      errors: [error],
    },
    {
      code: "type Identity<T> = T; type Wrapped<T> = Promise<Identity<T>>; function load(): Wrapped<unknown> { return promise; }",
      errors: [error],
    },
    { code: "function load(): globalThis.Promise<unknown> { return promise; }", errors: [error] },
    { code: "function load(): Awaited<unknown> { return input; }", errors: [error] },
    { code: "function load(): NoInfer<unknown> { return input; }", errors: [error] },
    { code: "function load(): Promise<NoInfer<unknown>> { return promise; }", errors: [error] },
    { code: "function load(): PromiseLike<unknown> { return promise; }", errors: [error] },
    { code: "async function* load(): AsyncGenerator<unknown> { yield input; }", errors: [error] },
    { code: "function load(): AsyncIterable<unknown> { return input; }", errors: [error] },
    { code: "function load(): AsyncIterator<unknown> { return input; }", errors: [error] },
    { code: "function* load(): Generator<unknown> { yield input; }", errors: [error] },
    { code: "function load(): Iterable<unknown> { return input; }", errors: [error] },
    {
      code: "type Box<T> = T; function load(): AsyncIterable<Box<unknown>> { return input; }",
      errors: [error],
    },
  ],
  valid: [
    "type ImportedValue = unknown;",
    "function parse(): ImportedValue { return input; }",
    "function parse(): User { return user; }",
    "function infer() { return input; }",
    "function generic<Value>(): Value { return value; }",
    "type Value = unknown; function generic<Value>(): Value { return value; }",
    "type Key = unknown; type Mapped<Input> = { [Key in keyof Input]: () => Key };",
    "type Item = unknown; type Unpacked<Input> = Input extends Promise<infer Item> ? () => Item : never;",
    "function cause(): { cause: unknown } { return { cause: input }; }",
    "type Result = { value: unknown }; function load(): Result { return result; }",
    "function load(): Promise<User> { return promise; }",
    "type Identity<T> = T; function load(): Identity<User> { return user; }",
    "type Value = unknown; function outer() { type Value = User; function load(): Value { return user; } }",
    'import type { Payload } from "./payload"; type Envelope = { kind: "empty" } | Payload; type Reply<Payload> = Envelope | Payload[]; function load(): Reply<unknown> { return reply; }',
    "function load(): globalThis.Promise<User> { return promise; }",
    "function* load(): Generator<User> { yield user; }",
    "interface Promise<T> { readonly value: T } function load(): Promise<unknown> { return box; }",
    "interface NoInfer<T> { readonly value: T } function load(): NoInfer<unknown> { return box; }",
    "function load(): Map<string, unknown> { return entries; }",
  ],
})
