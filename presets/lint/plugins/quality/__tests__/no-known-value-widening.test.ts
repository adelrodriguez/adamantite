import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })

const error = { messageId: "widening" }

const prelude = "type Command = () => void; const startCommand = () => {};"

tester.run("no-known-value-widening", plugin.rules["no-known-value-widening"], {
  invalid: [
    {
      code: "const value: unknown = {};",
      errors: [error],
      name: "report an empty object annotated as unknown",
    },
    {
      code: "const value: object = {};",
      errors: [error],
      name: "report an empty object annotated as object",
    },
    {
      code: "let value: unknown; value = {};",
      errors: [error],
      name: "report an empty object assigned to an unknown variable",
    },
    {
      code: "function create(): unknown { return {}; }",
      errors: [error],
      name: "report an empty object returned as unknown",
    },
    {
      code: `${prelude} const commands: Record<string, Command> = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a dictionary",
    },
    {
      code: `${prelude} const commands: { [key: string]: Command } = { start: startCommand };`,
      errors: [error],
      name: "report a known object in an index signature",
    },
    {
      code: `${prelude} const commands: { [K in string]: Command } = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a mapped type over string",
    },
    {
      code: `${prelude} const commands: { start: Command } = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a type literal that repeats its keys",
    },
    {
      code: `${prelude} const commands = { start: startCommand } as Record<string, Command>;`,
      errors: [error],
      name: "report a known object asserted to a dictionary",
    },
    {
      code: `${prelude} const commands = ({ start: startCommand } as Record<string, Command>) as object;`,
      errors: 1,
      name: "report a known object asserted to a dictionary and then to object once",
    },
    {
      code: `${prelude} class Registry { commands: Record<string, Command> = { start: startCommand }; }`,
      errors: [error],
      name: "report a known object in a class field dictionary",
    },
    {
      code: `${prelude} let commands: Record<string, Command>; commands = { start: startCommand };`,
      errors: [error],
      name: "report a known object assigned to a dictionary variable",
    },
    {
      code: `${prelude} function create(): Record<string, Command> { return { start: startCommand }; }`,
      errors: [error],
      name: "report a known object returned as a dictionary",
    },
    {
      code: `${prelude} function create(): { start: Command } { return { start: startCommand }; }`,
      errors: [error],
      name: "report a known object returned as a type literal that repeats its keys",
    },
    {
      code: `${prelude} const source = { start: startCommand }; const commands: Record<string, Command> = source;`,
      errors: [error],
      name: "report a known binding in a dictionary",
    },
    {
      code: `${prelude} type Open = Record<string, Command>; const source = { start: startCommand }; const commands: Open = source;`,
      errors: [error],
      name: "report a known binding in an alias of a dictionary",
    },
    {
      code: `${prelude} type Open = { [key: string]: Command }; const source = { start: startCommand }; const commands: Open = source;`,
      errors: [error],
      name: "report a known binding in an alias of an index signature",
    },
    {
      code: `${prelude} type Open = { [key in string]: Command }; const source = { start: startCommand }; const commands: Open = source;`,
      errors: [error],
      name: "report a known binding in an alias of a mapped type over string",
    },
    {
      code: `${prelude} type Open = Readonly<Record<string, Command>>; const source = { start: startCommand }; const commands: Open = source;`,
      errors: [error],
      name: "report a known binding in an alias of Readonly of a dictionary",
    },
    {
      code: `${prelude} function outer() { type Open = Record<string, Command>; const commands: Open = { start: startCommand }; }`,
      errors: [error],
      name: "report a known object in a local alias of a dictionary",
    },
    {
      code: `${prelude} type Index<T> = Record<string, T>; const commands: Index<Command> = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a generic dictionary alias",
    },
    {
      code: `${prelude} type Identity<T> = T; const commands: Identity<Record<string, Command>> = { start: startCommand };`,
      errors: [error],
      name: "report a known object in an identity alias of a dictionary",
    },
    {
      code: `${prelude} type Index<T> = Record<string, T>; type CommandsByName = Index<Command>; const commands: CommandsByName = { start: startCommand };`,
      errors: [error],
      name: "report a known object in an alias of a generic dictionary alias",
    },
    {
      code: `${prelude} type Index<T = Command> = Record<string, T>; const commands: Index = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a dictionary alias with a default type argument",
    },
    {
      code: `${prelude} type Key = string; const commands: Record<Key, Command> = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a Record over an alias of string",
    },
    {
      code: `${prelude} const commands: Record<PropertyKey, Command> = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a Record over PropertyKey",
    },
    {
      code: `${prelude} const commands: Record<string | 'start', Command> = { start: startCommand };`,
      errors: [error],
      name: "report a known object in a Record over a union with string",
    },
    {
      code: "const value: unknown = 1;",
      errors: [error],
      name: "report a number annotated as unknown",
    },
    {
      code: "const value: object = [];",
      errors: [error],
      name: "report an array annotated as object",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } isString('known');",
      errors: [error],
      name: "report a string literal passed to a type guard",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } const known = 'known'; isString(known);",
      errors: [error],
      name: "report a string constant passed to a type guard",
    },
    {
      code: "function isString(value: string | unknown): value is string { return true; } isString('known');",
      errors: [error],
      name: "report a string literal passed to a type guard with a union parameter",
    },
    {
      code: "type User = { readonly id: string }; function isUser(value: unknown): value is User { return true; } isUser({ id: 'known' });",
      errors: [error],
      name: "report an object literal passed to a type guard",
    },
    {
      code: "function assertDefined(value: unknown): asserts value is NonNullable<unknown> {} assertDefined('known');",
      errors: [error],
      name: "report a string literal passed to an assertion function",
    },
    {
      code: "interface ScoreMap { [name: string]: number } const scores: ScoreMap = { alice: 1 };",
      errors: [error],
      name: "report a known object in an interface with an index signature",
    },
    {
      code: "interface ScoreMap { readonly [name: string]: number } type Scores = ScoreMap; const scores: Scores = { alice: 1 };",
      errors: [error],
      name: "report a known object in an alias of an interface with a readonly index signature",
    },
    {
      code: "interface ScoreMap extends Record<string, number> {} const scores: ScoreMap = { alice: 1 };",
      errors: [error],
      name: "report a known object in an interface that extends a dictionary",
    },
    {
      code: "interface Bag<T> { [key: string]: T } const scores: Bag<number> = { alice: 1 };",
      errors: [error],
      name: "report a known object in a generic interface with an index signature",
    },
    {
      code: "function outer() { interface ScoreMap { [name: string]: number } const scores: ScoreMap = { alice: 1 }; }",
      errors: [error],
      name: "report a known object in a local interface with an index signature",
    },
    {
      code: "interface Dict<K extends string, V> extends Record<K, V> {} const d: Dict<string, number> = { a: 1 };",
      errors: [error],
      name: "report a known object in an interface that passes string keys to a Record it extends",
    },
    {
      code: "interface Dict<K extends string = string, V = number> extends Record<K, V> {} const d: Dict = { a: 1 };",
      errors: [error],
      name: "report a known object in an interface with default type arguments that extends a Record",
    },
    {
      code: "type Key = string; interface Dict<V, K extends string = Key> extends Readonly<Record<K, V>> {} const d: Dict<number> = { a: 1 };",
      errors: [error],
      name: "report a known object in an interface that passes an alias of string to Readonly of a Record",
    },
    // An `as` clause names the keys of a mapped type, so its keys decide whether the type is open.
    {
      code: "const scores: { [K in 'seed' as string]: number } = { alice: 1 };",
      errors: [error],
      name: "report a known object in a mapped type that renames keys to string",
    },
    {
      code: "type Scores = { [K in 'seed' as string]: number }; const other: Scores = { alice: 1 };",
      errors: [error],
      name: "report a known object in an alias of a mapped type that renames keys to string",
    },
    {
      code: "import type { Key } from './key'; const scores: { [K in 'seed' as Key]: number } = { alice: 1 };",
      errors: [error],
      name: "report a known object in a mapped type that renames keys to an imported type",
    },
  ],
  valid: [
    {
      code: `${prelude} const commands: Record<string, Command> = {};`,
      name: "accept an empty object in a dictionary",
    },
    {
      code: `${prelude} type Index<T> = Record<string, T>; const commands: Index<Command> = {};`,
      name: "accept an empty object in a generic dictionary alias",
    },
    {
      code: `${prelude} import type { Key } from "./key"; type Name = Key; type Index<Key> = { [K in Name]: Command }; const commands: Index<string> = { start: startCommand };`,
      name: "accept a mapped type over an imported key",
    },
    {
      code: `${prelude} class Registry { commands: Record<string, Command> = {}; }`,
      name: "accept an empty object in a class field dictionary",
    },
    {
      code: `${prelude} class Registry { accessor commands: Record<string, Command> = {}; }`,
      name: "accept an empty object in an accessor dictionary",
    },
    {
      code: `${prelude} let commands: Record<string, Command>; commands = {};`,
      name: "accept an empty object assigned to a dictionary variable",
    },
    {
      code: `${prelude} function create(): Record<string, Command> { return {}; }`,
      name: "accept an empty object returned as a dictionary",
    },
    {
      code: `${prelude} const create = (): Record<string, Command> => ({});`,
      name: "accept an empty object returned by an arrow as a dictionary",
    },
    {
      code: `${prelude} const commands = {} as Record<string, Command>;`,
      name: "accept an empty object asserted to a dictionary",
    },
    {
      code: `${prelude} const commands = <Record<string, Command>>{};`,
      name: "accept an empty object asserted with angle brackets to a dictionary",
    },
    {
      code: `${prelude} const commands = { start: startCommand };`,
      name: "accept an object without an annotation",
    },
    {
      code: `${prelude} const commands = { start: startCommand } as const;`,
      name: "accept a const assertion",
    },
    {
      code: `${prelude} const commands = { start: startCommand } satisfies Record<string, Command>;`,
      name: "accept a satisfies dictionary",
    },
    {
      code: `${prelude} type Commands = Record<string, Command>; const commands = { start: startCommand } as const satisfies Commands;`,
      name: "accept as const satisfies an alias of a dictionary",
    },
    {
      code: `${prelude} interface Commands { readonly start: Command } const commands: Commands = { start: startCommand };`,
      name: "accept a named interface with known keys",
    },
    {
      code: `${prelude} type Commands = { readonly start: Command }; const commands: Commands = { start: startCommand };`,
      name: "accept a named type alias with known keys",
    },
    {
      code: `${prelude} type PermissionLevels = { readonly [Level in Permission]: number }; const levels: PermissionLevels = { admin: 1 };`,
      name: "accept a mapped type over an unresolved key type",
    },
    {
      code: `${prelude} function create() { return { start: startCommand }; }`,
      name: "accept an inferred return type",
    },
    {
      code: `${prelude} interface Commands { readonly start: Command } function create(): Commands { return { start: startCommand }; }`,
      name: "accept a named interface return type",
    },
    {
      code: `${prelude} declare function make(): Record<string, Command>; const commands: Record<string, Command> = make();`,
      name: "accept a call result in a dictionary",
    },
    {
      code: `${prelude} import { Commands } from './types'; const commands: Commands = { start: startCommand };`,
      name: "accept an imported annotation",
    },
    {
      code: `${prelude} type Diet = 'vegan' | 'omnivore'; const labels: Record<Diet, string> = { vegan: 'V', omnivore: 'O' };`,
      name: "accept a Record over a key union",
    },
    {
      code: `${prelude} type Diet = 'vegan' | 'omnivore'; type Labels = Record<Diet, string>; const labels: Labels = { vegan: 'V', omnivore: 'O' };`,
      name: "accept an alias of a Record over a key union",
    },
    {
      code: `${prelude} type Diet = 'vegan' | 'omnivore'; const labels: Readonly<Record<Diet, string>> = { vegan: 'V', omnivore: 'O' };`,
      name: "accept Readonly of a Record over a key union",
    },
    {
      code: `${prelude} const labels: Record<'a' | 'b', number> = { a: 1, b: 2 };`,
      name: "accept a Record over a literal key union",
    },
    {
      code: "type Kind = 'a' | 'b'; const counts: { [K in Kind]: number } = { a: 1, b: 2 };",
      name: "accept a mapped type over a key union",
    },
    {
      code: "const counts: { readonly [K in 'a' | 'b']: number } = { a: 1, b: 2 };",
      name: "accept a readonly mapped type over a literal key union",
    },
    {
      code: `type Kind = 'a' | 'b'; const getters: { [K in Kind as \`get\${K}\`]: number } = { geta: 1, getb: 2 };`,
      name: "accept a mapped type over a key union with renamed keys",
    },
    {
      code: "interface ScoreMap { [name: string]: number } const scores: ScoreMap = {};",
      name: "accept an empty object in an interface with an index signature",
    },
    {
      code: "interface Dict<K extends string, V> extends Record<K, V> {} const d: Dict<'a' | 'b', number> = { a: 1, b: 2 };",
      name: "accept an interface that extends a Record over a key union",
    },
    {
      code: `${prelude} type Index<Key extends PropertyKey, Value> = Record<Key, Value>; const commands: Index<'start', Command> = { start: startCommand };`,
      name: "accept a generic Record alias over a literal key",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } declare const input: unknown; isString(input);",
      name: "accept an unknown value passed to a type guard",
    },
    {
      code: "function isString(value: string | unknown): value is string { return true; } declare const input: string | unknown; isString(input);",
      name: "accept an unknown union value passed to a type guard",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } declare function readInput(): unknown; isString(readInput());",
      name: "accept an unknown call result passed to a type guard",
    },
    // TypeScript narrows the caller's binding at a guard call, so a declared type is not widened.
    {
      code: "function isString(value: unknown): value is string { return typeof value === 'string'; } export function label(input: string | number) { return isString(input) ? input : input.toFixed(2); }",
      name: "accept a union passed to a type guard that narrows it",
    },
    {
      code: "function assertDefined(value: unknown): asserts value is NonNullable<unknown> {} export function use(input: string | undefined) { assertDefined(input); return input; }",
      name: "accept an optional value passed to an assertion function",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } type Input = string | number; export function label(input: Input) { return isString(input); }",
      name: "accept a union alias passed to a type guard",
    },
    {
      code: "function assertDefined(value: unknown): asserts value is NonNullable<unknown> {} export function use(input?: string) { assertDefined(input); }",
      name: "accept an optional parameter passed to an assertion function",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } export function label<T>(input: T) { return isString(input); }",
      name: "accept a type parameter passed to a type guard",
    },
    {
      code: "type Animal = { readonly name: string }; type Dog = Animal & { readonly bark: () => void }; function isDog(value: unknown): value is Dog { return true; } export function check(animal: Animal) { return isDog(animal); }",
      name: "accept a supertype passed to a type guard of a subtype",
    },
    {
      code: "function isString(value: unknown): value is string { return true; } function check(known: string): boolean { return isString(known); }",
      name: "accept a string parameter passed to a string type guard",
    },
    {
      code: "const isString = (value: unknown): value is string => true; const known: string = getValue(); isString(known);",
      name: "accept a string binding from a call passed to a string type guard",
    },
    {
      code: "type User = { readonly id: string }; function isUser(value: unknown): value is User { return true; } function parse(): User | null { return null; } const user = parse(); isUser(user);",
      name: "accept a nullable call result passed to a type guard",
    },
  ],
})
