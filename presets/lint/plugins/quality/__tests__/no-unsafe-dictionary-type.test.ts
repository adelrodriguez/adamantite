import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

const error = { messageId: "unsafeDictionary" }

tester.run("no-unsafe-dictionary-type", plugin.rules["no-unsafe-dictionary-type"], {
  invalid: [
    {
      code: "type A = Record<string, unknown>;",
      errors: [error],
      name: "report a Record of unknown",
    },
    {
      code: "type A = { [key: string]: any };",
      errors: [error],
      name: "report an index signature of any",
    },
    {
      code: "type A = { [index: number]: Command; [key: string]: unknown | Command };",
      errors: 1,
      name: "report a string index signature in a union with unknown",
    },
    {
      code: "type A = { [K in PropertyKey]: object };",
      errors: [error],
      name: "report a mapped type over PropertyKey of object",
    },
    {
      code: "type A = { [K in PropertyKey]: NonNullable<unknown> };",
      errors: [error],
      name: "report a mapped type over PropertyKey of NonNullable of unknown",
    },
    {
      code: "type A = { [key: string]: NonNullable<unknown> };",
      errors: [error],
      name: "report an index signature of NonNullable of unknown",
    },
    {
      code: "type A = Record<string, {}>;",
      errors: [error],
      name: "report a Record of an empty object type",
    },
    {
      code: "interface Escape {} type A = Record<string, Escape>;",
      errors: [error],
      name: "report a Record of an empty interface",
    },
    {
      code: "interface Escape { readonly __brand?: never } type A = Record<string, Escape>;",
      errors: [error],
      name: "report a Record of an interface with only an optional brand",
    },
    {
      code: "type Escape = { readonly __brand?: never }; type A = Record<string, Escape>;",
      errors: [error],
      name: "report a Record of an alias with only an optional brand",
    },
    {
      code: "type A = Record<string, { readonly __brand?: never }>;",
      errors: [error],
      name: "report a Record of a type literal with only an optional brand",
    },
    {
      code: "type A = Record<string, string | unknown>;",
      errors: [error],
      name: "report a Record of a union with unknown",
    },
    {
      code: "interface Escape {} type A = Record<string, string | Escape>;",
      errors: [error],
      name: "report a Record of a union with an empty interface",
    },
    {
      code: "type A = Record<string, unknown & {}>;",
      errors: [error],
      name: "report a Record of unknown intersected with an empty object type",
    },
    {
      code: "interface Owner { readonly id: string } type A = Record<string, any & Owner>;",
      errors: [error],
      name: "report a Record of any intersected with a named interface",
    },
    {
      code: "type Escape = unknown; type A = Record<string, Escape>;",
      errors: [error],
      name: "report a Record of an alias of unknown",
    },
    {
      code: "type Dict = Record<string, unknown>;",
      errors: [error],
      name: "report a dictionary alias",
    },
    {
      code: "type A = Readonly<Partial<Required<(Record<string, unknown>)>>>;",
      errors: [error],
      name: "report a Record under nested parenthesized wrappers",
    },
    {
      code: "type A = { readonly [key: string]: unknown };",
      errors: [error],
      name: "report a readonly index signature of unknown",
    },
    {
      code: "type A = { readonly [K in string]: unknown };",
      errors: [error],
      name: "report a readonly mapped type over string of unknown",
    },
    {
      code: "type Source = Record<string, unknown>; type A = Pick<Source, string>;",
      errors: 2,
      name: "report Pick of an unsafe dictionary alias",
    },
    {
      code: "type Source = Record<string, unknown>; type A = Omit<Source, never>;",
      errors: 2,
      name: "report Omit of an unsafe dictionary alias",
    },
    {
      code: "type Index<T> = Record<string, T>; type A = Index<unknown>;",
      errors: 1,
      name: "report a generic dictionary alias with an unknown argument",
    },
    {
      code: "type Index<T> = Record<string, T>; type Outer<T> = Index<T>; type A = Outer<unknown>;",
      errors: 1,
      name: "report a generic alias that passes unknown to a dictionary alias",
    },
    {
      code: "type Index<U> = Record<string, U>; type Outer<T> = Index<T | Command>; type A = Outer<unknown>;",
      errors: 1,
      name: "report a generic alias that passes unknown in a union to a dictionary alias",
    },
    {
      code: "type Index<T, U> = Record<string, U>; type Outer<T> = Index<Command, T | Command>; type A = Outer<unknown>;",
      errors: 1,
      name: "report a generic alias that passes unknown in a union as the second argument",
    },
    {
      code: "interface A { [key: string]: unknown }",
      errors: [error],
      name: "report an interface with an index signature of unknown",
    },
    {
      code: "type A = Readonly<Record<string, unknown>>;",
      errors: 1,
      name: "report Readonly of a Record of unknown",
    },
    {
      code: "type A = Record<string, Readonly<unknown>>;",
      errors: [error],
      name: "report a Record of Readonly of unknown",
    },
    {
      code: "type A = Record<string, Partial<unknown>>;",
      errors: [error],
      name: "report a Record of Partial of unknown",
    },
    {
      code: "type A = Record<string, Required<unknown>>;",
      errors: [error],
      name: "report a Record of Required of unknown",
    },
    {
      code: "type Escape = Readonly<unknown>; type A = Record<string, Escape>;",
      errors: 1,
      name: "report a Record of an alias of Readonly of unknown",
    },
    {
      code: "type Wrapped<T> = Readonly<T>; type A = Record<string, Wrapped<unknown>>;",
      errors: 1,
      name: "report a Record of a generic alias of Readonly of unknown",
    },
    {
      code: "type A = Record<string, NonNullable<unknown>>;",
      errors: [error],
      name: "report a Record of NonNullable of unknown",
    },
    {
      code: "type Escape = NonNullable<unknown>; type A = Record<string, Escape>;",
      errors: 1,
      name: "report a Record of an alias of NonNullable of unknown",
    },
    {
      code: "type Unsafe = Record<string, unknown>; const x: Unsafe = {}; const y: Unsafe = {};",
      errors: 1,
      name: "report a dictionary alias once and not its plain uses",
    },
    {
      code: "type Unsafe = Record<string, unknown>; type AlsoUnsafe = Unsafe; const x: Unsafe = {};",
      errors: 2,
      name: "report a dictionary alias and an alias of it",
    },
    {
      code: "type Unsafe = Record<string, unknown>; type AlsoUnsafe = Readonly<Unsafe>;",
      errors: 2,
      name: "report a dictionary alias and Readonly of it",
    },
    {
      code: "type Fields = Record<string, unknown>; type Logger = { info: (event: Fields) => void; warn(event: Fields): void };",
      errors: 1,
      name: "report a dictionary alias once and not its uses in a type literal",
    },
    {
      code: "type Fields = Record<string, unknown>; interface Logger { info: (event: Fields) => void; warn(event: Fields): void }",
      errors: 1,
      name: "report a dictionary alias once and not its uses in an interface",
    },
    {
      code: "type Fields = Record<string, unknown>; type Log = (event: Fields) => void;",
      errors: 1,
      name: "report a dictionary alias once and not its use in a function type",
    },
    {
      code: "type Unsafe = Record<string, unknown>; type A = { bag: Unsafe };",
      errors: 1,
      name: "report a dictionary alias once and not its use in a property type",
    },
    {
      code: "type Unsafe = Record<string, unknown>; type A = Unsafe | Command;",
      errors: 1,
      name: "report a dictionary alias once and not its use in a union",
    },
    {
      code: "type Index<T = unknown> = Record<string, T>; type A = Index;",
      errors: 2,
      name: "report an unknown default type argument and the alias that uses it",
    },
    {
      code: "type Index<T, U = T> = Record<string, U>; type A = Index<string, unknown>;",
      errors: 1,
      name: "report an unknown second argument that a default passes through",
    },
    {
      code: "type Index<T, U = T> = Record<string, U>; type A = Index<unknown>;",
      errors: 1,
      name: "report an unknown first argument that a default passes through",
    },
    {
      code: "type Value<T> = T; type Index<T, U = Value<T>> = Record<string, U>; type A = Index<unknown>;",
      errors: 1,
      name: "report an unknown argument that a default passes through a generic alias",
    },
    {
      code: "type Marker<T> = { readonly __brand?: never }; type Index<T, U = Marker<T>> = Record<string, U>; type A = Index<Item>;",
      errors: 2,
      name: "report an empty object default type argument and the alias that uses it",
    },
    {
      code: "function outer() { type Identity<T> = T; type A = Record<string, Identity<unknown>>; }",
      errors: 1,
      name: "report a local identity alias of unknown",
    },
    {
      code: "function local() { type Record<K, V> = { key: K; value: V }; type A = Record<string, unknown>; } function global() { type A = Record<string, unknown>; }",
      errors: 1,
      name: "report a global Record of unknown and not one that a local alias shadows",
    },
    {
      code: "function f(x: Record<string, unknown>) {}",
      errors: [error],
      name: "report a parameter type",
    },
    {
      code: "type Pick<T> = T extends string ? Record<string, unknown> : never;",
      errors: [error],
      name: "report a Record of unknown in a conditional type branch",
    },
    {
      code: "type Narrow<T> = T extends Record<string, unknown> ? true : false; type Bag = Narrow<Record<string, unknown>>;",
      errors: 1,
      name: "report the argument of a conditional type alias",
    },
    {
      code: "type Bag = Extract<Record<string, unknown>, object>;",
      errors: [error],
      name: "report the first argument of Extract",
    },
    {
      code: "type Extract<T, U> = { value: T; filter: U }; type A = Extract<string, Record<string, unknown>>;",
      errors: [error],
      name: "report the filter of a local Extract alias",
    },
    {
      code: "function outer() { type Exclude<T, U> = { value: T; filter: U }; type A = Exclude<string, Record<string, unknown>>; }",
      errors: [error],
      name: "report the filter of a local Exclude alias in a function",
    },
    {
      code: "interface Bag extends Record<string, unknown> { id: string }",
      errors: [error],
      name: "report an interface that extends a Record of unknown",
    },
    {
      code: "interface Bag extends Readonly<Record<string, unknown>> {}",
      errors: [error],
      name: "report an interface that extends Readonly of a Record of unknown",
    },
    {
      code: "class Bag implements Record<string, unknown> { [key: string]: string }",
      errors: [error],
      name: "report a class that implements a Record of unknown",
    },
    {
      code: "interface Bag extends globalThis.Record<string, unknown> {}",
      errors: [error],
      name: "report an interface that extends globalThis.Record of unknown",
    },
    // A default type argument is the value type of every plain use of the alias.
    {
      code: "type Bag<T = unknown> = Record<string, T>; const a: Bag = {};",
      errors: [error],
      name: "report a dictionary alias with an unknown default type argument",
    },
    {
      code: "interface Bag<T = unknown> { [key: string]: T }",
      errors: [error],
      name: "report a dictionary interface with an unknown default type argument",
    },
    // `globalThis.Record` names the global type, even where an import shadows `Record`.
    {
      code: "type A = globalThis.Record<string, unknown>;",
      errors: [error],
      name: "report globalThis.Record of unknown",
    },
    {
      code: 'import { Record } from "effect"; type A = globalThis.Record<string, unknown>;',
      errors: [error],
      name: "report globalThis.Record of unknown beside an imported Record",
    },
    {
      code: "type A = Record<string, globalThis.Readonly<unknown>>;",
      errors: [error],
      name: "report a Record of globalThis.Readonly of unknown",
    },
    {
      code: "class Bag<T = unknown> implements Record<string, T> { [key: string]: T }",
      errors: 2,
      name: "report a class with an unknown default that implements a Record and its index signature",
    },
    {
      code: "type A = Record<string | 'a', unknown>;",
      errors: [error],
      name: "report a Record over a union with string",
    },
    {
      code: "type Key = string; type A = Record<Key, unknown>;",
      errors: [error],
      name: "report a Record over an alias of string",
    },
    {
      code: 'import type { Key } from "./key"; type A = Record<Key, unknown>;',
      errors: [error],
      name: "report a Record over an imported key type",
    },
    {
      code: "type A<K extends string> = { [P in K]: unknown };",
      errors: [error],
      name: "report a mapped type over an unconstrained string key",
    },
    // An `as` clause names the keys of a mapped type, so its keys decide whether the type is open.
    {
      code: "type Bag = { [K in 'seed' as string]: unknown };",
      errors: [error],
      name: "report a mapped type that renames keys to string",
    },
    // A named interface passes its type arguments to its index signatures and heritage, as an
    // alias passes them to its body.
    {
      code: "interface Bag<V> extends Record<string, V> {} type A = Bag<unknown>;",
      errors: [error],
      name: "report an interface that extends a Record with an unknown argument",
    },
    {
      code: "interface Bag<V> extends Record<string, V> {} function f(bag: Bag<unknown>) {}",
      errors: [error],
      name: "report an interface that extends a Record with an unknown argument in a parameter type",
    },
    {
      code: "interface Bag<V> extends Record<string, V> {} const bag: Bag<unknown> = {};",
      errors: [error],
      name: "report an interface that extends a Record with an unknown argument in a variable type",
    },
    {
      code: "interface Bag<K extends string, V> extends Readonly<Record<K, V>> {} type A = Bag<string, any>;",
      errors: [error],
      name: "report an interface that extends Readonly of a Record with string keys and any",
    },
    {
      code: "interface Bag<T> { [key: string]: T } type A = Bag<unknown>;",
      errors: [error],
      name: "report a dictionary interface with an unknown argument",
    },
    {
      code: "interface Bag<T> { [key: string]: T } interface Outer<U> extends Bag<U> {} type A = Outer<object>;",
      errors: [error],
      name: "report an interface that passes object to a dictionary interface it extends",
    },
    {
      code: "interface Bag<T = unknown> { [key: string]: T } const a: Bag = {}; function f(bag: Bag) {}",
      errors: 1,
      name: "report a dictionary interface with an unknown default once and not its plain uses",
    },
    {
      code: "interface Bag extends Record<string, unknown> {} const a: Bag = {}; function f(bag: Bag) {}",
      errors: 1,
      name: "report an interface that extends a Record of unknown once and not its plain uses",
    },
    // A nearer alias hides an outer type parameter with the same name.
    {
      code: "function outer<T>() { function inner() { type T = unknown; type A = Record<string, T>; } }",
      errors: [error],
      name: "report a nearer alias of unknown that hides an outer type parameter",
    },
    {
      code: `type Bag = { [K in 'a' | 'b' as \`get\${string}\`]: unknown };`,
      errors: [error],
      name: "report a mapped type that renames keys to a template literal with string",
    },
  ],
  valid: [
    { code: "type Commands = Record<string, Command>;", name: "accept a Record of a named type" },
    {
      code: "type Metadata = Record<PropertyKey, JsonValue>;",
      name: "accept a Record over PropertyKey of a JSON value",
    },
    {
      code: "type PermissionLevels = Record<Permission, number>;",
      name: "accept a Record over a named key type",
    },
    {
      code: "type Indexed = { [key: string]: Command };",
      name: "accept an index signature of a named type",
    },
    {
      code: "type CompatibleIndexes = { [index: number]: Command; [key: string]: Command | OtherCommand };",
      name: "accept compatible number and string index signatures",
    },
    {
      code: "type Exhaustive = { [K in Permission]: number };",
      name: "accept a mapped type over a named key type",
    },
    {
      code: "type Allowed = Record<string, { payload: unknown }>;",
      name: "accept a Record of an object type that holds unknown",
    },
    {
      code: "type AlsoAllowed = Record<string, Result<Data, unknown>>;",
      name: "accept a Record of a generic type with an unknown argument",
    },
    {
      code: "type Index<T> = Record<string, T>; type EntityIndex<T extends Entity> = Record<string, T>;",
      name: "accept generic dictionary aliases",
    },
    {
      code: "type Safe = Index<Command>; type Index<T> = Record<string, T>;",
      name: "accept a generic dictionary alias declared after its use",
    },
    {
      code: 'import type { Payload } from "./payload"; type Envelope = Payload; type Replies<Payload> = Record<string, Envelope>; type Batch = Replies<unknown>;',
      name: "accept an imported alias that a type parameter shadows",
    },
    {
      code: "type A = Map<string, unknown>; type B = ReadonlyMap<string, unknown>; type C = WeakMap<object, unknown>;",
      name: "accept Map types of unknown",
    },
    {
      code: "import { Record } from './local'; type A = Record<string, unknown>;",
      name: "accept an imported Record",
    },
    {
      code: "type Record<K, V> = { key: K; value: V }; type A = Record<string, unknown>;",
      name: "accept a local Record alias",
    },
    {
      code: "type Readonly<T> = { value: T }; type A = Record<string, Readonly<unknown>>;",
      name: "accept a local Readonly alias of unknown",
    },
    {
      code: "type NonNullable<T> = { value: T }; type A = Record<string, NonNullable<unknown>>;",
      name: "accept a local NonNullable alias of unknown",
    },
    {
      code: "type Value<T> = T; type Index<T = Command, U = Value<T>> = Record<string, U>; type A = Index;",
      name: "accept a default type argument that resolves to a named type",
    },
    {
      code: "interface Owner { readonly id: string } type A = Record<string, unknown & Owner>;",
      name: "accept unknown intersected with a named interface",
    },
    {
      code: "interface Owner { readonly id: string } interface Child extends Owner {} type A = Record<string, Child>;",
      name: "accept a Record of an interface that extends a named interface",
    },
    {
      code: "interface Owner { readonly id: string } interface Child extends Owner { readonly __brand?: never } type A = Record<string, Child>;",
      name: "accept a Record of an interface that adds an optional brand to a named interface",
    },
    {
      code: "interface Escape {} interface Escape { readonly id: string } type A = Record<string, Escape>;",
      name: "accept a merged interface whose second declaration has a property",
    },
    {
      code: "interface Escape { readonly id: string } interface Escape {} type A = Record<string, Escape>;",
      name: "accept a merged interface whose first declaration has a property",
    },
    {
      code: "interface Owner { readonly id: string } type A = Record<string, object & Owner>;",
      name: "accept object intersected with a named interface",
    },
    {
      code: "type Wrap<T> = { readonly wrapped: T }; type Inner<T, U> = { readonly value: T } & Wrap<U>; type Outer<T, U> = Record<string, Inner<T, U>>; declare function f<T, U>(): Outer<T, U>;",
      name: "accept a generic intersection of object types",
    },
    {
      code: "type WithSchema<T extends Record<string, unknown>> = (schema: T) => void;",
      name: "accept a constraint of a function type parameter",
    },
    {
      code: "function run<T extends Record<string, unknown>>(input: T): T { return input; }",
      name: "accept a constraint of a function type parameter in a declaration",
    },
    {
      code: "declare class Store<T extends Record<string, unknown>> { read(): T }",
      name: "accept a constraint of a class type parameter",
    },
    {
      code: "type Deep<T extends Readonly<Record<string, unknown>>> = T;",
      name: "accept a Readonly constraint of a type alias parameter",
    },
    {
      code: "export type IsPlain<T> = T extends Record<string, unknown> ? true : false;",
      name: "accept a conditional type test",
    },
    {
      code: "export type Plain<T> = Extract<T, Record<string, unknown>>;",
      name: "accept the filter of Extract",
    },
    {
      code: "export type NotPlain<T> = Exclude<T, Readonly<Record<string, unknown>>>;",
      name: "accept the filter of Exclude",
    },
    {
      code: "type Merge<T> = T; export type Deep<T> = { [K in keyof T]: T[K] extends Record<string, unknown> ? Merge<T[K]> : T[K] };",
      name: "accept a conditional type test inside a mapped type",
    },
    {
      code: "export type Nested<T> = T extends { readonly data: Record<string, unknown> } ? T['data'] : never;",
      name: "accept a nested conditional type test",
    },
    {
      code: "interface Owner extends Record<string, Command> { id: string }",
      name: "accept an interface that extends a Record of a named type",
    },
    {
      code: "class Store implements Record<string, string> { [key: string]: string }",
      name: "accept a class that implements a Record of strings",
    },
    {
      code: "interface Record<K, V> { key: K; value: V } interface Bag extends Record<string, unknown> {}",
      name: "accept an interface that extends a local Record interface",
    },
    {
      code: "type Bag<T = Command> = Record<string, T>; const a: Bag = {};",
      name: "accept a dictionary alias with a named default type argument",
    },
    {
      code: "interface Bag<T = Command> { [key: string]: T }",
      name: "accept a dictionary interface with a named default type argument",
    },
    {
      code: "type A = globalThis.Record<string, Command>;",
      name: "accept globalThis.Record of a named type",
    },
    // A finite literal key set is a closed object, like `{ a: unknown; b: unknown }`.
    {
      code: "type A = Record<'a' | 'b', unknown>;",
      name: "accept a Record over a literal key union",
    },
    {
      code: "interface Bag<V> extends Record<string, V> {} type A = Bag<number>; const bag: Bag<Command> = {};",
      name: "accept an interface that extends a dictionary with named type arguments",
    },
    {
      code: "interface Bag<K extends string, V> extends Record<K, V> {} type A = Bag<'a' | 'b', unknown>;",
      name: "accept an interface that extends a Record over a key union",
    },
    {
      code: "interface Bag<T> { [key: string]: T } function f(bag: Bag<Command>) {}",
      name: "accept a dictionary interface with a named type argument",
    },
    {
      code: "type Kind = 'a' | 'b'; type A = { [K in Kind]: unknown };",
      name: "accept a mapped type over a key union",
    },
    {
      code: `type Kind = 'a' | 'b'; type A = { [K in Kind as \`get\${K}\`]: unknown };`,
      name: "accept a mapped type over a key union with renamed keys",
    },
    {
      code: "type A = { [K in 'a' | 'b' as K]: unknown };",
      name: "accept a mapped type over a literal key union that keeps its keys",
    },
    {
      code: "type A = Partial<Record<'a', unknown>>;",
      name: "accept Partial of a Record over a literal key",
    },
    {
      code: "interface Bag<T = unknown> { read<T>(input: Record<string, T>): T }",
      name: "accept a method type parameter that shadows an interface default",
    },
    {
      code: "export type Plain<T> = globalThis.Extract<T, Record<string, unknown>>;",
      name: "accept the filter of globalThis.Extract",
    },
  ],
})
