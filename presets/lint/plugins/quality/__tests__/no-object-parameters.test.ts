import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "objectParameter" }

tester.run("no-object-parameters", plugin.rules["no-object-parameters"], {
  invalid: [
    { code: "function f(value: object) {}", errors: [error], name: "report an object parameter" },
    // The message names the fixes that pass the core and strict presets, such as `WeakKey` for a
    // weak collection key. A generic must appear again in the signature, or core's
    // typescript/no-unnecessary-type-parameters reports it and asks for `object` again (#772).
    {
      code: "declare const records: WeakMap<object, string>; function getEvaluatorRecord(evaluator: object) { return records.get(evaluator); }",
      errors: [
        {
          message:
            "Parameter `evaluator` uses the broad `object` type. Use a named domain type, `WeakKey` for a WeakMap or WeakSet key, or a generic `<T extends object>` that the signature uses again, such as in the return type, so the caller keeps its type.",
        },
      ],
      name: "report an object WeakMap key with a message that names WeakKey",
    },
    {
      code: "type Alias = object; function f(value: Alias) {}",
      errors: [error],
      name: "report an alias of object",
    },
    {
      code: "type Alias = (object); function f(value: Alias) {}",
      errors: [error],
      name: "report a parenthesized alias of object",
    },
    {
      code: "type Item = object; type Fallback<Input> = Input extends infer Item ? string : (value: Item) => void;",
      errors: [error],
      name: "report an alias of object outside the infer branch",
    },
    {
      code: "function consume(value: object = {}): void {}",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report an object parameter with a default",
    },
    {
      code: "function consume({ value }: object = {}): void {}",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
      name: "report a destructured object parameter with a default",
    },
    {
      code: "type Bag = object; function consume({ value }: Bag): void {}",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
      name: "report a destructured parameter typed by an alias of object",
    },
    {
      code: "function outer() { type Payload = object; function consume(value: Payload) {} }",
      errors: [error],
      name: "report a local alias of object",
    },
    {
      code: "function outer() { function consume(value: Payload) {} type Payload = object; }",
      errors: [error],
      name: "report a local alias of object declared after its use",
    },
    {
      code: "type Identity<T> = T; function consume(value: Identity<object>) {}",
      errors: [error],
      name: "report an identity alias of object",
    },
    {
      code: "type Identity<T> = T; type Wrapped<T> = Identity<T>; function consume(value: Wrapped<object>) {}",
      errors: [error],
      name: "report a chain of identity aliases of object",
    },
    // `Readonly`, `NonNullable`, and an intersection with `{}` leave `object` as broad as before.
    {
      code: "function visit(node: Readonly<object>) {}",
      errors: [error],
      name: "report Readonly of object",
    },
    {
      code: "function visit(node: NonNullable<object>) {}",
      errors: [error],
      name: "report NonNullable of object",
    },
    {
      code: "function visit(node: globalThis.Readonly<object>) {}",
      errors: [error],
      name: "report globalThis.Readonly of object",
    },
    {
      code: "function visit(node: Readonly<NonNullable<object>> | null) {}",
      errors: [error],
      name: "report nested wrappers of object in a union with null",
    },
    {
      code: "type Node = Readonly<object>; function visit(node: Node) {}",
      errors: [error],
      name: "report an alias of Readonly of object",
    },
    {
      code: "function visit(node: object & {}) {}",
      errors: [error],
      name: "report object intersected with an empty object type",
    },
    {
      code: "function visit(node: {} & object & {}) {}",
      errors: [error],
      name: "report object between empty object types",
    },
    {
      code: "type Empty = {}; function visit(node: object & Empty) {}",
      errors: [error],
      name: "report object intersected with an alias of an empty object type",
    },
  ],
  valid: [
    {
      code: "declare const records: WeakMap<WeakKey, string>; function getEvaluatorRecord(evaluator: WeakKey) { return records.get(evaluator); }",
      name: "accept a WeakKey parameter",
    },
    { code: "type Alias = object;", name: "accept an alias of object without a parameter" },
    { code: "function f(value: Alias) {}", name: "accept a parameter whose alias is not declared" },
    {
      code: "interface Owner { readonly id: string } function f(value: Owner) {}",
      name: "accept a named interface parameter",
    },
    { code: "function f<Value>(value: Value) {}", name: "accept a type parameter" },
    {
      code: "function f<Value extends object>(value: Value) {}",
      name: "accept a type parameter constrained to object",
    },
    {
      code: "function f<Value extends Owner, Owner extends { readonly id: string }>(value: Value) {}",
      name: "accept a type parameter constrained to a named shape",
    },
    {
      code: "type Owner = { readonly id: string }; function f<Value extends Owner>(value: Value) {}",
      name: "accept a type parameter constrained to an alias",
    },
    {
      code: "type Alias = object; function consume<Alias>(value: Alias) {}",
      name: "accept a type parameter that shadows an alias of object in a function",
    },
    {
      code: "type Alias = object; type Consumer<Alias> = (value: Alias) => void;",
      name: "accept a type parameter that shadows an alias of object in a function type",
    },
    {
      code: "type Alias = object; interface Consumer<Alias> { consume(value: Alias): void }",
      name: "accept a type parameter that shadows an alias of object in an interface",
    },
    {
      code: "type Key = object; type Mapped<Input> = { [Key in keyof Input]: (value: Key) => void };",
      name: "accept a mapped type key that shadows an alias of object",
    },
    {
      code: "type Item = object; type Unpacked<Input> = Input extends Promise<infer Item> ? (value: Item) => void : never;",
      name: "accept an infer type that shadows an alias of object",
    },
    {
      code: "type Payload = object; function outer() { type Payload = { readonly id: string }; function consume(value: Payload) {} }",
      name: "accept a nearer alias that shadows an alias of object",
    },
    {
      code: "type Identity<T> = T; function consume<Identity>(value: Identity) {}",
      name: "accept a type parameter that shadows a generic alias",
    },
    {
      code: "function one() { type Payload = object; } function two() { function consume(value: Payload) {} }",
      name: "accept an alias of object in another function scope",
    },
    {
      code: "type Readonly<T> = { readonly value: T }; function visit(node: Readonly<object>) {}",
      name: "accept a local Readonly alias of object",
    },
    {
      code: "interface Owner { readonly id: string } function visit(node: Readonly<Owner>) {}",
      name: "accept Readonly of a named interface",
    },
    {
      code: "interface Owner { readonly id: string } function visit(node: object & Owner) {}",
      name: "accept object intersected with a named interface",
    },
    {
      code: "function visit(node: object & { readonly id: string }) {}",
      name: "accept object intersected with a type literal",
    },
    {
      code: "function visit(node: {} & {}) {}",
      name: "accept an intersection of empty object types",
    },
  ],
})
