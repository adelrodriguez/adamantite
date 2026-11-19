import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "runtimeTypeof" }
const allowInTypeGuards = [{ allowInTypeGuards: true }]

tester.run("no-runtime-typeof", plugin.rules["no-runtime-typeof"], {
  invalid: [
    {
      code: 'function resolve(raw: unknown) { const { headers } = raw!; return typeof headers === "function"; }',
      errors: [error],
      name: "report a property destructured from a non-null unknown",
    },
    {
      code: 'function resolve(raw: unknown) { const { headers } = raw as Options; return typeof headers === "function"; }',
      errors: [error],
      name: "report a property destructured from an unknown assertion",
    },
    {
      code: 'if (typeof input === "string") use(input);',
      errors: [error],
      name: "report a global without a type",
    },
    {
      code: "if (typeof input === undefined) use(input);",
      errors: [error],
      name: "report a comparison with the undefined value",
    },
    {
      code: 'function f(value: unknown) { return typeof value === "string"; }',
      errors: [error],
      name: "report an unknown parameter",
    },
    {
      code: 'function f(value: any) { return typeof value === "string"; }',
      errors: [error],
      name: "report an any parameter",
    },
    {
      code: 'function f(value: string | (number | unknown)) { return typeof value === "string"; }',
      errors: [error],
      name: "report a nested union with unknown",
    },
    {
      code: 'function f(value) { return typeof value === "string"; }',
      errors: [error],
      name: "report a parameter without a type",
    },
    {
      code: 'const data = JSON.parse(text); export const isObject = typeof data === "object";',
      errors: [error],
      name: "report a JSON.parse result",
    },
    {
      code: 'function f(options: Record<string, unknown>) { return typeof options.retry === "number"; }',
      errors: [error],
      name: "report a property of a dictionary of unknown",
    },
    {
      code: 'function f(options: { retry: any }) { const { retry } = options; return typeof retry === "number"; }',
      errors: [error],
      name: "report a property destructured from an object with an any property",
    },
    {
      code: 'function f(options) { const { retry } = options; return typeof retry === "number"; }',
      errors: [error],
      name: "report a property destructured from a parameter without a type",
    },
    {
      code: 'function f(options: Options) { const { inner } = options; const { retry } = inner; return typeof retry === "number"; }',
      errors: [error],
      name: "report a property destructured twice from a named type",
    },
    {
      code: 'function f(options: Options) { return typeof options.load() === "string"; }',
      errors: [error],
      name: "report a call result of a named type",
    },
    {
      code: 'function f(options: Options) { return typeof (options as unknown as Raw).retry === "number"; }',
      errors: [error],
      name: "report an as assertion on an owned binding",
    },
    {
      code: 'function f(options: Options) { return typeof (options satisfies Raw)!.retry === "number"; }',
      errors: [error],
      name: "report a satisfies expression on an owned binding",
    },
    {
      code: 'function f(options: unknown) { return typeof options!.retry === "number"; }',
      errors: [error],
      name: "report a non-null assertion on an unknown binding",
    },
    {
      code: 'function isString(value: unknown): value is string { return typeof value === "string"; }',
      errors: [error],
      name: "report a type guard without allowInTypeGuards",
    },
    {
      code: 'function parse(value: unknown): string { if (typeof value !== "string") throw new Error(); return value; }',
      errors: [error],
      name: "report a function that is not a type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'function isString(value: unknown): value is string { const check = () => typeof value === "string"; return check(); }',
      errors: [error],
      name: "report a nested arrow inside a type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'function check(values: unknown[]): boolean { return values.every((item) => typeof item === "string"); }',
      errors: [error],
      name: "report an every callback outside a type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item): boolean => typeof item === "string"); }',
      errors: [error],
      name: "report an every callback with a boolean return type with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'const check: (value: unknown) => boolean = (value) => typeof value === "string";',
      errors: [error],
      name: "report an arrow typed by its variable as a boolean function with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'const isText: (value: unknown) => value is string = (value) => typeof value === "string";',
      errors: [error],
      name: "report an arrow typed by its variable as a type guard without allowInTypeGuards",
    },
    {
      code: 'function f<T>(value: T) { return typeof value === "string"; }',
      errors: [error],
      name: "report an unconstrained type parameter",
    },
    {
      code: 'function f<T>(value: NonNullable<T>) { return typeof value === "string"; }',
      errors: [error],
      name: "report NonNullable of a type parameter",
    },
    {
      code: 'function f<T>(value: NoInfer<T>) { return typeof value === "string"; }',
      errors: [error],
      name: "report NoInfer of a type parameter",
    },
    {
      code: 'function f<T>(value: Awaited<T>) { return typeof value === "string"; }',
      errors: [error],
      name: "report Awaited of a type parameter",
    },
    {
      code: 'function f<T>(value: T & {}) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter intersected with an empty object type",
    },
    {
      code: 'function f<T>(value: T & ({})) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter intersected with a parenthesized empty object type",
    },
    {
      code: 'type Empty = {}; function f<T>(value: T & Empty) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter intersected with an alias of an empty object type",
    },
    {
      code: 'function f<T>(value: T & object) { return typeof value === "function"; }',
      errors: [error],
      name: "report a type parameter intersected with object",
    },
    {
      code: 'const f = <T,>(value: T) => typeof value === "string";',
      errors: [error],
      name: "report an arrow type parameter",
    },
    {
      code: 'function f<T extends unknown>(value: T) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter constrained to unknown",
    },
    {
      code: 'function f<T extends Record<string, any>>(value: T) { return typeof value.id === "string"; }',
      errors: [error],
      name: "report a type parameter constrained to a dictionary of any",
    },
    {
      code: 'function f<T>(value: T | null) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter in a union with null",
    },
    {
      code: 'function f<T, U extends T>(value: U) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter constrained to an unconstrained type parameter",
    },
    {
      code: 'function f<T>({ id }: T) { return typeof id === "string"; }',
      errors: [error],
      name: "report a property destructured from a type parameter",
    },
    {
      code: 'class Store<T> { has(value: T) { return typeof value === "string"; } }',
      errors: [error],
      name: "report a class type parameter",
    },
    {
      code: 'type Data = unknown; export function f(value: Data) { return typeof value === "string"; }',
      errors: [error],
      name: "report an exported alias of unknown",
    },
    {
      code: 'type Raw = unknown; type Data = Raw | null; function f(value: Data) { return typeof value === "string"; }',
      errors: [error],
      name: "report an alias of a union with an alias of unknown",
    },
    {
      code: 'type Loose = Record<string, any>; function f(value: Loose) { return typeof value.name === "string"; }',
      errors: [error],
      name: "report a property of an alias of a dictionary of any",
    },
    {
      code: 'type Box<T> = T; function f(value: Box<unknown>) { return typeof value === "string"; }',
      errors: [error],
      name: "report an identity alias of unknown",
    },
    {
      code: 'type Box<T> = T; type Data = unknown; function f(value: Box<Data>) { return typeof value === "string"; }',
      errors: [error],
      name: "report an identity alias of an alias of unknown",
    },
    {
      code: 'type Payload<T> = { data: T; meta: unknown }; function f(value: Payload<string>) { return typeof value.data === "string"; }',
      errors: [error],
      name: "report a property of a generic type whose other property is unknown",
    },
    {
      code: 'type Options = { retry: unknown }; function f(options: Options) { const { retry } = options; return typeof retry === "number"; }',
      errors: [error],
      name: "report a property destructured from an alias with an unknown property",
    },
    {
      code: 'type Same<X> = X; function f<T>(value: Same<T>) { return typeof value === "string"; }',
      errors: [error],
      name: "report an identity alias of a type parameter",
    },
    {
      code: 'type Data = unknown; function f<T extends Data>(value: T) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter constrained to an alias of unknown",
    },
    // A type parameter hides an outer type with the same name.
    {
      code: 'type T = string | number; function f<T>(value: T) { return typeof value === "string"; }',
      errors: [error],
      name: "report a type parameter that shadows a union alias",
    },
    {
      code: 'function outer<T extends string>() { function inner() { type T = unknown; function show(value: T) { return typeof value === "string"; } return show; } return inner; }',
      errors: [error],
      name: "report a nearer alias of unknown that hides an outer type parameter",
    },
  ],
  valid: [
    {
      code: 'type NonNullable<X> = string | number; function f<T>(value: NonNullable<T>) { return typeof value === "string"; }',
      name: "accept a local NonNullable alias of a union",
    },
    {
      code: 'function f<T>(value: T & RetryOptions) { return typeof value.retry === "number"; }',
      name: "accept a type parameter intersected with a named type",
    },
    {
      code: 'function f<T extends string | number>(value: T) { return typeof value === "string"; }',
      name: "accept a type parameter constrained to a union",
    },
    {
      code: 'function f<T extends string, U extends T>(value: U) { return typeof value === "string"; }',
      name: "accept a type parameter constrained to another constrained type parameter",
    },
    {
      code: 'type T = string | number; function f(value: T) { return typeof value === "string"; }',
      name: "accept a union alias",
    },
    {
      code: 'const isServer = typeof document === "undefined";',
      name: "accept an undefined check of document",
    },
    {
      code: 'const hasStorage = typeof localStorage !== "undefined";',
      name: "accept an undefined check of localStorage",
    },
    {
      code: 'if (typeof globalThis.crypto === "undefined") throw new Error("no crypto");',
      name: "accept an undefined check of a globalThis property",
    },
    {
      code: 'const missing = "undefined" === typeof process;',
      name: "accept an undefined check with the string on the left",
    },
    { code: "const value = input;", name: "accept code without typeof" },
    {
      code: 'function delay(retry: number | RetryPolicy): number { return typeof retry === "number" ? retry : retry.delay; }',
      name: "accept a union parameter",
    },
    {
      code: 'async function resolve(headers: HeadersInit | (() => Promise<HeadersInit>)) { return typeof headers === "function" ? await headers() : headers; }',
      name: "accept a union with a function type",
    },
    {
      code: 'function resolve(options: FetchTransportOptions) { return typeof (options.headers) === "function"; }',
      name: "accept a parenthesized property of a named type",
    },
    {
      code: 'function resolve(options?: FetchTransportOptions) { return typeof options!.headers === "function"; }',
      name: "accept a non-null property of an optional named type",
    },
    {
      code: 'function resolve(options?: FetchTransportOptions) { const { headers } = options!; return typeof headers === "function"; }',
      name: "accept a property destructured from a non-null optional named type",
    },
    {
      code: 'function resolve(options: Config) { const { headers } = options.transport; return typeof headers === "function"; }',
      name: "accept a property destructured from a nested property of a named type",
    },
    {
      code: 'function resolve({ headers }: FetchTransportOptions = {}) { return typeof headers === "function"; }',
      name: "accept a destructured parameter with a default",
    },
    {
      code: 'function resolve(options?: TransportConfig) { return typeof options?.transport!.headers === "function"; }',
      name: "accept an optional chain with a non-null assertion",
    },
    {
      code: 'function resolve(options: FetchTransportOptions) { const { headers } = options; return typeof headers === "function"; }',
      name: "accept a property destructured from a named type",
    },
    {
      code: 'function resolve(options: FetchTransportOptions) { const { headers: init = {} } = options; return typeof init === "function"; }',
      name: "accept a renamed property with a default",
    },
    {
      code: 'function resolve({ headers }: FetchTransportOptions) { return typeof headers === "function"; }',
      name: "accept a destructured parameter",
    },
    {
      code: 'function resolve(retry: number | RetryPolicy = 3) { return typeof retry === "number"; }',
      name: "accept a union parameter with a default",
    },
    {
      code: 'class AsyncRun<T> { constructor(input: AsyncRunInput<T>) { this.run = typeof input === "function" ? input : input.try; } }',
      name: "accept a generic class constructor parameter",
    },
    {
      code: 'declare const input: string | number; export const isText = typeof input === "string";',
      name: "accept a declared union",
    },
    {
      code: 'type Input = string | (() => string); function f(value: Input) { return typeof value === "string" ? value : value(); }',
      name: "accept a union alias with a function type",
    },
    {
      code: 'type Box<T> = T; function f(value: Box<string | number>) { return typeof value === "string"; }',
      name: "accept an identity alias of a union",
    },
    {
      code: 'type Same<X> = X; function f<T extends string | number>(value: Same<T>) { return typeof value === "string"; }',
      name: "accept an identity alias of a constrained type parameter",
    },
    {
      code: 'type Data = unknown; namespace Local { type Data = string | number; export function f(value: Data) { return typeof value === "string"; } }',
      name: "accept a namespace alias that shadows an alias of unknown",
    },
    // A nearer type declaration hides an outer type parameter with the same name.
    {
      code: 'function outer<T>() { function inner() { type T = string | number; function show(value: T) { return typeof value === "string"; } return show; } return inner; }',
      name: "accept a nearer type alias that hides an outer type parameter",
    },
    {
      code: 'function outer<T>() { function inner() { interface T { readonly kind: string } function show(value: T) { return typeof value.kind === "string"; } return show; } return inner; }',
      name: "accept a nearer interface that hides an outer type parameter",
    },
    {
      code: 'import type { Data } from "./data"; function f(value: Data) { return typeof value === "string"; }',
      name: "accept an imported alias whose body the rule cannot see",
    },
    {
      code: 'function isString(value: unknown): value is string { return typeof value === "string"; }',
      name: "accept a type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'const isString = (value: unknown): value is string => typeof value === "string";',
      name: "accept an arrow type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'function assertString(value: unknown): asserts value is string { if (typeof value !== "string") throw new Error(); }',
      name: "accept an assertion function with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }',
      name: "accept an every callback inside a type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(function (item) { return typeof item === "string"; }); }',
      name: "accept an every function expression inside a type guard with allowInTypeGuards",
      options: allowInTypeGuards,
    },
    {
      code: 'export const isText: (value: unknown) => value is string = (value) => typeof value === "string";',
      name: "accept a type guard arrow typed by its variable with allowInTypeGuards",
      options: allowInTypeGuards,
    },
  ],
})
