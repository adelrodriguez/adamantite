import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownReturn" }

tester.run("no-unknown-returns", plugin.rules["no-unknown-returns"], {
  invalid: [
    {
      code: "function load(): unknown { return input; }",
      errors: [error],
      name: "report a function that returns unknown",
    },
    {
      code: "const load = (): unknown => input;",
      errors: [error],
      name: "report an arrow that returns unknown",
    },
    {
      code: "type Loader = () => unknown;",
      errors: [error],
      name: "report a function type that returns unknown",
    },
    {
      code: "interface Loader { load(): unknown }",
      errors: [error],
      name: "report an interface method that returns unknown",
    },
    {
      code: "declare function load(): unknown;",
      errors: [error],
      name: "report a declared function that returns unknown",
    },
    {
      code: "function load(): string | unknown { return input; }",
      errors: [error],
      name: "report a union return type with unknown",
    },
    {
      code: "function load(): Promise<unknown> { return promise; }",
      errors: [error],
      name: "report a Promise of unknown",
    },
    {
      code: "type UnknownValue = unknown; function load(): UnknownValue { return input; }",
      errors: [error],
      name: "report an alias of unknown as a return type",
    },
    {
      code: "type Item = unknown; type Fallback<Input> = Input extends infer Item ? string : () => Item;",
      errors: [error],
      name: "report an alias of unknown outside the infer branch",
    },
    {
      code: "function outer() { type Result = unknown; function load(): Result { return input; } }",
      errors: [error],
      name: "report a local alias of unknown inside a function",
    },
    {
      code: "type Identity<T> = T; function load(): Identity<unknown> { return input; }",
      errors: [error],
      name: "report an identity alias of unknown",
    },
    {
      code: "type Identity<T> = T; type Wrapped<T> = Promise<Identity<T>>; function load(): Wrapped<unknown> { return promise; }",
      errors: [error],
      name: "report a nested generic alias that wraps unknown in a Promise",
    },
    {
      code: "function load(): globalThis.Promise<unknown> { return promise; }",
      errors: [error],
      name: "report globalThis.Promise of unknown",
    },
    {
      code: "function load(): Awaited<unknown> { return input; }",
      errors: [error],
      name: "report Awaited of unknown",
    },
    {
      code: "function load(): NoInfer<unknown> { return input; }",
      errors: [error],
      name: "report NoInfer of unknown",
    },
    {
      code: "function load(): Promise<NoInfer<unknown>> { return promise; }",
      errors: [error],
      name: "report a Promise of NoInfer of unknown",
    },
    {
      code: "function load(): PromiseLike<unknown> { return promise; }",
      errors: [error],
      name: "report a PromiseLike of unknown",
    },
    {
      code: "async function* load(): AsyncGenerator<unknown> { yield input; }",
      errors: [error],
      name: "report an AsyncGenerator of unknown",
    },
    {
      code: "function load(): AsyncIterable<unknown> { return input; }",
      errors: [error],
      name: "report an AsyncIterable of unknown",
    },
    {
      code: "function load(): AsyncIterator<unknown> { return input; }",
      errors: [error],
      name: "report an AsyncIterator of unknown",
    },
    {
      code: "function* load(): Generator<unknown> { yield input; }",
      errors: [error],
      name: "report a Generator of unknown",
    },
    {
      code: "function load(): Iterable<unknown> { return input; }",
      errors: [error],
      name: "report an Iterable of unknown",
    },
    {
      code: "type Box<T> = T; function load(): AsyncIterable<Box<unknown>> { return input; }",
      errors: [error],
      name: "report an AsyncIterable of an identity alias of unknown",
    },
  ],
  valid: [
    {
      code: "type ImportedValue = unknown;",
      name: "accept an alias of unknown without a function",
    },
    {
      code: "function parse(): ImportedValue { return input; }",
      name: "accept a return type that is an unresolved alias",
    },
    { code: "function parse(): User { return user; }", name: "accept a named return type" },
    { code: "function infer() { return input; }", name: "accept an inferred return type" },
    {
      code: "function generic<Value>(): Value { return value; }",
      name: "accept a type parameter return type",
    },
    {
      code: "type Value = unknown; function generic<Value>(): Value { return value; }",
      name: "accept a type parameter that shadows an alias of unknown",
    },
    {
      code: "type Key = unknown; type Mapped<Input> = { [Key in keyof Input]: () => Key };",
      name: "accept a mapped type key that shadows an alias of unknown",
    },
    {
      code: "type Item = unknown; type Unpacked<Input> = Input extends Promise<infer Item> ? () => Item : never;",
      name: "accept an infer type that shadows an alias of unknown",
    },
    {
      code: "function cause(): { cause: unknown } { return { cause: input }; }",
      name: "accept an object return type that holds unknown",
    },
    {
      code: "type Result = { value: unknown }; function load(): Result { return result; }",
      name: "accept an object alias that holds unknown",
    },
    {
      code: "function load(): Promise<User> { return promise; }",
      name: "accept a Promise of a named type",
    },
    {
      code: "type Identity<T> = T; function load(): Identity<User> { return user; }",
      name: "accept an identity alias of a named type",
    },
    {
      code: "type Value = unknown; function outer() { type Value = User; function load(): Value { return user; } }",
      name: "accept a nearer alias that shadows an alias of unknown",
    },
    {
      code: 'import type { Payload } from "./payload"; type Envelope = { kind: "empty" } | Payload; type Reply<Payload> = Envelope | Payload[]; function load(): Reply<unknown> { return reply; }',
      name: "accept an imported alias that a type parameter shadows",
    },
    {
      code: "function load(): globalThis.Promise<User> { return promise; }",
      name: "accept globalThis.Promise of a named type",
    },
    {
      code: "function* load(): Generator<User> { yield user; }",
      name: "accept a Generator of a named type",
    },
    {
      code: "interface Promise<T> { readonly value: T } function load(): Promise<unknown> { return box; }",
      name: "accept a local Promise interface of unknown",
    },
    {
      code: "interface NoInfer<T> { readonly value: T } function load(): NoInfer<unknown> { return box; }",
      name: "accept a local NoInfer interface of unknown",
    },
    {
      code: "function load(): Map<string, unknown> { return entries; }",
      name: "accept a Map with unknown values",
    },
  ],
})
