import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownAlias" }

tester.run("no-unknown-type-aliases", plugin.rules["no-unknown-type-aliases"], {
  invalid: [
    { code: "type Alias = unknown;", errors: [error], name: "report an alias of unknown" },
    {
      code: "type Current = unknown;",
      errors: [error],
      name: "report an alias of unknown with another name",
    },
    {
      code: "type UnknownValue = unknown; type Alias = UnknownValue;",
      errors: [error, error],
      name: "report an alias of an alias of unknown",
    },
    {
      code: "type Payload = string | unknown;",
      errors: [error],
      name: "report a union with unknown",
    },
    {
      code: "type Payload = string | unknown; type NestedPayload = number | Payload;",
      errors: [error, error],
      name: "report a union with an alias of a union with unknown",
    },
    {
      code: "type Identity<T> = T; type Payload = Identity<unknown>;",
      errors: [error],
      name: "report a generic identity alias of unknown",
    },
    {
      code: "type Identity<T> = T; type Wrapped<T> = Identity<T>; type Payload = Wrapped<unknown>;",
      errors: [error],
      name: "report a chain of identity aliases of unknown",
    },
    {
      code: "function outer() { type Payload = unknown; }",
      errors: [error],
      name: "report an alias of unknown inside a function",
    },
    {
      code: "type Box<T> = T; type Payload = Box<unknown>;",
      errors: [error],
      name: "report a generic alias whose body is its type parameter",
    },
    {
      code: "type Second<A, B = A> = B; type Payload = Second<unknown>;",
      errors: [error],
      name: "report a type parameter default that passes unknown through",
    },
    {
      code: "type Payload = Awaited<unknown>;",
      errors: [error],
      name: "report Awaited of unknown",
    },
    {
      code: "type Payload = NoInfer<unknown>;",
      errors: [error],
      name: "report NoInfer of unknown",
    },
    {
      code: "type Payload = string | NoInfer<unknown>;",
      errors: [error],
      name: "report a union with NoInfer of unknown",
    },
  ],
  valid: [
    { code: "type User = { readonly id: string };", name: "accept an object type alias" },
    {
      code: "type Alias = string; type UserId = Alias;",
      name: "accept an alias of a string alias",
    },
    { code: "type Payload = string | number;", name: "accept a union of known types" },
    {
      code: "type Box<T> = { readonly value: T }; type Payload = Box<unknown>;",
      name: "accept a generic object type that holds unknown",
    },
    {
      code: 'import type { Payload } from "./payload"; type Envelope = { kind: "empty" } | Payload; type Reply<Payload> = Envelope | Payload[]; type BatchReply = Reply<unknown>;',
      name: "accept an imported alias that a type parameter shadows",
    },
    { code: "type Payload = Promise<unknown>;", name: "accept a Promise of unknown" },
    {
      code: "interface NoInfer<T> { readonly value: T } type Payload = NoInfer<unknown>;",
      name: "accept a local NoInfer interface that holds unknown",
    },
  ],
})
