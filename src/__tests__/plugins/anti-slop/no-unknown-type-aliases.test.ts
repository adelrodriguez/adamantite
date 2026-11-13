import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownAlias" }

tester.run("no-unknown-type-aliases", plugin.rules["no-unknown-type-aliases"], {
  invalid: [
    { code: "type Alias = unknown;", errors: [error] },
    { code: "type Current = unknown;", errors: [error] },
    { code: "type UnknownValue = unknown; type Alias = UnknownValue;", errors: [error, error] },
    { code: "type Payload = string | unknown;", errors: [error] },
    {
      code: "type Payload = string | unknown; type NestedPayload = number | Payload;",
      errors: [error, error],
    },
    {
      code: "type Identity<T> = T; type Payload = Identity<unknown>;",
      errors: [error],
    },
    {
      code: "type Identity<T> = T; type Wrapped<T> = Identity<T>; type Payload = Wrapped<unknown>;",
      errors: [error],
    },
    {
      code: "function outer() { type Payload = unknown; }",
      errors: [error],
    },
    { code: "type Box<T> = T; type Payload = Box<unknown>;", errors: [error] },
    { code: "type Second<A, B = A> = B; type Payload = Second<unknown>;", errors: [error] },
    { code: "type Payload = Awaited<unknown>;", errors: [error] },
    { code: "type Payload = NoInfer<unknown>;", errors: [error] },
    { code: "type Payload = string | NoInfer<unknown>;", errors: [error] },
  ],
  valid: [
    "type User = { readonly id: string };",
    "type Alias = string; type UserId = Alias;",
    "type Payload = string | number;",
    "type Box<T> = { readonly value: T }; type Payload = Box<unknown>;",
    'import type { Payload } from "./payload"; type Envelope = { kind: "empty" } | Payload; type Reply<Payload> = Envelope | Payload[]; type BatchReply = Reply<unknown>;',
    "type Payload = Promise<unknown>;",
    "interface NoInfer<T> { readonly value: T } type Payload = NoInfer<unknown>;",
  ],
})
