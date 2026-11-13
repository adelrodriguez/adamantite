import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

const error = { messageId: "unsafeDictionary" }

tester.run("no-unsafe-dictionary-type", plugin.rules["no-unsafe-dictionary-type"], {
  invalid: [
    { code: "type A = Record<string, unknown>;", errors: [error] },
    { code: "type A = { [key: string]: any };", errors: [error] },
    { code: "type A = { [index: number]: Command; [key: string]: unknown | Command };", errors: 1 },
    { code: "type A = { [K in PropertyKey]: object };", errors: [error] },
    { code: "type A = { [K in PropertyKey]: NonNullable<unknown> };", errors: [error] },
    { code: "type A = { [key: string]: NonNullable<unknown> };", errors: [error] },
    { code: "type A = Record<string, {}>;", errors: [error] },
    { code: "interface Escape {} type A = Record<string, Escape>;", errors: [error] },
    {
      code: "interface Escape { readonly __brand?: never } type A = Record<string, Escape>;",
      errors: [error],
    },
    {
      code: "type Escape = { readonly __brand?: never }; type A = Record<string, Escape>;",
      errors: [error],
    },
    { code: "type A = Record<string, { readonly __brand?: never }>;", errors: [error] },
    { code: "type A = Record<string, string | unknown>;", errors: [error] },
    { code: "interface Escape {} type A = Record<string, string | Escape>;", errors: [error] },
    { code: "type A = Record<string, unknown & {}>;", errors: [error] },
    {
      code: "interface Owner { readonly id: string } type A = Record<string, any & Owner>;",
      errors: [error],
    },
    { code: "type Escape = unknown; type A = Record<string, Escape>;", errors: [error] },
    { code: "type Dict = Record<string, unknown>;", errors: [error] },
    { code: "type A = Readonly<Partial<Required<(Record<string, unknown>)>>>;", errors: [error] },
    { code: "type A = { readonly [key: string]: unknown };", errors: [error] },
    { code: "type A = { readonly [K in string]: unknown };", errors: [error] },
    { code: "type Source = Record<string, unknown>; type A = Pick<Source, string>;", errors: 2 },
    { code: "type Source = Record<string, unknown>; type A = Omit<Source, never>;", errors: 2 },
    { code: "type Index<T> = Record<string, T>; type A = Index<unknown>;", errors: 1 },
    {
      code: "type Index<T> = Record<string, T>; type Outer<T> = Index<T>; type A = Outer<unknown>;",
      errors: 1,
    },
    {
      code: "type Index<U> = Record<string, U>; type Outer<T> = Index<T | Command>; type A = Outer<unknown>;",
      errors: 1,
    },
    {
      code: "type Index<T, U> = Record<string, U>; type Outer<T> = Index<Command, T | Command>; type A = Outer<unknown>;",
      errors: 1,
    },
    { code: "interface A { [key: string]: unknown }", errors: [error] },
    { code: "type A = Readonly<Record<string, unknown>>;", errors: 1 },
    { code: "type A = Record<string, Readonly<unknown>>;", errors: [error] },
    { code: "type A = Record<string, Partial<unknown>>;", errors: [error] },
    { code: "type A = Record<string, Required<unknown>>;", errors: [error] },
    { code: "type Escape = Readonly<unknown>; type A = Record<string, Escape>;", errors: 1 },
    {
      code: "type Wrapped<T> = Readonly<T>; type A = Record<string, Wrapped<unknown>>;",
      errors: 1,
    },
    { code: "type A = Record<string, NonNullable<unknown>>;", errors: [error] },
    { code: "type Escape = NonNullable<unknown>; type A = Record<string, Escape>;", errors: 1 },
    {
      code: "type Unsafe = Record<string, unknown>; const x: Unsafe = {}; const y: Unsafe = {};",
      errors: 1,
    },
    {
      code: "type Unsafe = Record<string, unknown>; type AlsoUnsafe = Unsafe; const x: Unsafe = {};",
      errors: 2,
    },
    // An unsafe default makes the declaration unsafe, and the alias that uses it reports too.
    { code: "type Index<T = unknown> = Record<string, T>; type A = Index;", errors: 2 },
    {
      code: "type Index<T, U = T> = Record<string, U>; type A = Index<string, unknown>;",
      errors: 1,
    },
    { code: "type Index<T, U = T> = Record<string, U>; type A = Index<unknown>;", errors: 1 },
    {
      code: "type Value<T> = T; type Index<T, U = Value<T>> = Record<string, U>; type A = Index<unknown>;",
      errors: 1,
    },
    {
      code: "type Marker<T> = { readonly __brand?: never }; type Index<T, U = Marker<T>> = Record<string, U>; type A = Index<Item>;",
      errors: 2,
    },
    {
      code: "function outer() { type Identity<T> = T; type A = Record<string, Identity<unknown>>; }",
      errors: 1,
    },
    {
      code: "function local() { type Record<K, V> = { key: K; value: V }; type A = Record<string, unknown>; } function global() { type A = Record<string, unknown>; }",
      errors: 1,
    },
    { code: "function f(x: Record<string, unknown>) {}", errors: [error] },
    {
      code: "type Pick<T> = T extends string ? Record<string, unknown> : never;",
      errors: [error],
    },
    {
      code: "type Narrow<T> = T extends Record<string, unknown> ? true : false; type Bag = Narrow<Record<string, unknown>>;",
      errors: 1,
    },
    { code: "type Bag = Extract<Record<string, unknown>, object>;", errors: [error] },
    {
      code: "type Extract<T, U> = { value: T; filter: U }; type A = Extract<string, Record<string, unknown>>;",
      errors: [error],
    },
    {
      code: "function outer() { type Exclude<T, U> = { value: T; filter: U }; type A = Exclude<string, Record<string, unknown>>; }",
      errors: [error],
    },
    // A heritage clause is a dictionary contract too.
    { code: "interface Bag extends Record<string, unknown> { id: string }", errors: [error] },
    { code: "interface Bag extends Readonly<Record<string, unknown>> {}", errors: [error] },
    {
      code: "class Bag implements Record<string, unknown> { [key: string]: string }",
      errors: [error],
    },
    { code: "interface Bag extends globalThis.Record<string, unknown> {}", errors: [error] },
    // A default type argument is the value type of every plain use of the alias.
    { code: "type Bag<T = unknown> = Record<string, T>; const a: Bag = {};", errors: [error] },
    { code: "interface Bag<T = unknown> { [key: string]: T }", errors: [error] },
    // `globalThis.Record` names the global type, even where an import shadows `Record`.
    { code: "type A = globalThis.Record<string, unknown>;", errors: [error] },
    {
      code: 'import { Record } from "effect"; type A = globalThis.Record<string, unknown>;',
      errors: [error],
    },
    { code: "type A = Record<string, globalThis.Readonly<unknown>>;", errors: [error] },
    { code: "class Bag<T = unknown> implements Record<string, T> { [key: string]: T }", errors: 2 },
    // A key set that can be open stays a dictionary.
    { code: "type A = Record<string | 'a', unknown>;", errors: [error] },
    { code: "type Key = string; type A = Record<Key, unknown>;", errors: [error] },
    { code: 'import type { Key } from "./key"; type A = Record<Key, unknown>;', errors: [error] },
    { code: "type A<K extends string> = { [P in K]: unknown };", errors: [error] },
    // An `as` clause names the keys of a mapped type, so its keys decide whether the type is open.
    { code: "type Bag = { [K in 'seed' as string]: unknown };", errors: [error] },
    // A named interface passes its type arguments to its index signatures and heritage, as an
    // alias passes them to its body.
    {
      code: "interface Bag<V> extends Record<string, V> {} type A = Bag<unknown>;",
      errors: [error],
    },
    {
      code: "interface Bag<V> extends Record<string, V> {} function f(bag: Bag<unknown>) {}",
      errors: [error],
    },
    {
      code: "interface Bag<V> extends Record<string, V> {} const bag: Bag<unknown> = {};",
      errors: [error],
    },
    {
      code: "interface Bag<K extends string, V> extends Readonly<Record<K, V>> {} type A = Bag<string, any>;",
      errors: [error],
    },
    { code: "interface Bag<T> { [key: string]: T } type A = Bag<unknown>;", errors: [error] },
    {
      code: "interface Bag<T> { [key: string]: T } interface Outer<U> extends Bag<U> {} type A = Outer<object>;",
      errors: [error],
    },
    // A plain use of an unsafe interface reports only at the declaration, as a plain alias use does.
    {
      code: "interface Bag<T = unknown> { [key: string]: T } const a: Bag = {}; function f(bag: Bag) {}",
      errors: 1,
    },
    {
      code: "interface Bag extends Record<string, unknown> {} const a: Bag = {}; function f(bag: Bag) {}",
      errors: 1,
    },
    // A nearer alias hides an outer type parameter with the same name.
    {
      code: "function outer<T>() { function inner() { type T = unknown; type A = Record<string, T>; } }",
      errors: [error],
    },
    { code: `type Bag = { [K in 'a' | 'b' as \`get\${string}\`]: unknown };`, errors: [error] },
  ],
  valid: [
    "type Commands = Record<string, Command>;",
    "type Metadata = Record<PropertyKey, JsonValue>;",
    "type PermissionLevels = Record<Permission, number>;",
    "type Indexed = { [key: string]: Command };",
    "type CompatibleIndexes = { [index: number]: Command; [key: string]: Command | OtherCommand };",
    "type Exhaustive = { [K in Permission]: number };",
    "type Allowed = Record<string, { payload: unknown }>;",
    "type AlsoAllowed = Record<string, Result<Data, unknown>>;",
    "type Index<T> = Record<string, T>; type EntityIndex<T extends Entity> = Record<string, T>;",
    "type Safe = Index<Command>; type Index<T> = Record<string, T>;",
    'import type { Payload } from "./payload"; type Envelope = Payload; type Replies<Payload> = Record<string, Envelope>; type Batch = Replies<unknown>;',
    "type A = Map<string, unknown>; type B = ReadonlyMap<string, unknown>; type C = WeakMap<object, unknown>;",
    "import { Record } from './local'; type A = Record<string, unknown>;",
    "type Record<K, V> = { key: K; value: V }; type A = Record<string, unknown>;",
    "type Readonly<T> = { value: T }; type A = Record<string, Readonly<unknown>>;",
    "type NonNullable<T> = { value: T }; type A = Record<string, NonNullable<unknown>>;",
    "type Value<T> = T; type Index<T = Command, U = Value<T>> = Record<string, U>; type A = Index;",
    "interface Owner { readonly id: string } type A = Record<string, unknown & Owner>;",
    "interface Owner { readonly id: string } interface Child extends Owner {} type A = Record<string, Child>;",
    "interface Owner { readonly id: string } interface Child extends Owner { readonly __brand?: never } type A = Record<string, Child>;",
    "interface Escape {} interface Escape { readonly id: string } type A = Record<string, Escape>;",
    "interface Escape { readonly id: string } interface Escape {} type A = Record<string, Escape>;",
    "interface Owner { readonly id: string } type A = Record<string, object & Owner>;",
    "type Wrap<T> = { readonly wrapped: T }; type Inner<T, U> = { readonly value: T } & Wrap<U>; type Outer<T, U> = Record<string, Inner<T, U>>; declare function f<T, U>(): Outer<T, U>;",
    "type WithSchema<T extends Record<string, unknown>> = (schema: T) => void;",
    "function run<T extends Record<string, unknown>>(input: T): T { return input; }",
    "declare class Store<T extends Record<string, unknown>> { read(): T }",
    "type Deep<T extends Readonly<Record<string, unknown>>> = T;",
    // A conditional type test and the filter of `Extract` or `Exclude` have no `object` rewrite.
    "export type IsPlain<T> = T extends Record<string, unknown> ? true : false;",
    "export type Plain<T> = Extract<T, Record<string, unknown>>;",
    "export type NotPlain<T> = Exclude<T, Readonly<Record<string, unknown>>>;",
    "type Merge<T> = T; export type Deep<T> = { [K in keyof T]: T[K] extends Record<string, unknown> ? Merge<T[K]> : T[K] };",
    "export type Nested<T> = T extends { readonly data: Record<string, unknown> } ? T['data'] : never;",
    "interface Owner extends Record<string, Command> { id: string }",
    "class Store implements Record<string, string> { [key: string]: string }",
    "interface Record<K, V> { key: K; value: V } interface Bag extends Record<string, unknown> {}",
    "type Bag<T = Command> = Record<string, T>; const a: Bag = {};",
    "interface Bag<T = Command> { [key: string]: T }",
    "type A = globalThis.Record<string, Command>;",
    // A finite literal key set is a closed object, like `{ a: unknown; b: unknown }`.
    "type A = Record<'a' | 'b', unknown>;",
    "interface Bag<V> extends Record<string, V> {} type A = Bag<number>; const bag: Bag<Command> = {};",
    "interface Bag<K extends string, V> extends Record<K, V> {} type A = Bag<'a' | 'b', unknown>;",
    "interface Bag<T> { [key: string]: T } function f(bag: Bag<Command>) {}",
    "type Kind = 'a' | 'b'; type A = { [K in Kind]: unknown };",
    `type Kind = 'a' | 'b'; type A = { [K in Kind as \`get\${K}\`]: unknown };`,
    "type A = { [K in 'a' | 'b' as K]: unknown };",
    "type A = Partial<Record<'a', unknown>>;",
    "interface Bag<T = unknown> { read<T>(input: Record<string, T>): T }",
    "export type Plain<T> = globalThis.Extract<T, Record<string, unknown>>;",
  ],
})
