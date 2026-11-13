import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

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
    },
    {
      code: 'function resolve(raw: unknown) { const { headers } = raw as Options; return typeof headers === "function"; }',
      errors: [error],
    },
    { code: 'if (typeof input === "string") use(input);', errors: [error] },
    { code: "if (typeof input === undefined) use(input);", errors: [error] },
    { code: 'function f(value: unknown) { return typeof value === "string"; }', errors: [error] },
    { code: 'function f(value: any) { return typeof value === "string"; }', errors: [error] },
    {
      code: 'function f(value: string | (number | unknown)) { return typeof value === "string"; }',
      errors: [error],
    },
    { code: 'function f(value) { return typeof value === "string"; }', errors: [error] },
    {
      code: 'const data = JSON.parse(text); export const isObject = typeof data === "object";',
      errors: [error],
    },
    {
      code: 'function f(options: Record<string, unknown>) { return typeof options.retry === "number"; }',
      errors: [error],
    },
    {
      code: 'function f(options: { retry: any }) { const { retry } = options; return typeof retry === "number"; }',
      errors: [error],
    },
    {
      code: 'function f(options) { const { retry } = options; return typeof retry === "number"; }',
      errors: [error],
    },
    {
      code: 'function f(options: Options) { const { inner } = options; const { retry } = inner; return typeof retry === "number"; }',
      errors: [error],
    },
    {
      code: 'function f(options: Options) { return typeof options.load() === "string"; }',
      errors: [error],
    },
    {
      code: 'function f(options: Options) { return typeof (options as unknown as Raw).retry === "number"; }',
      errors: [error],
      name: "as assertion on an owned binding",
    },
    {
      code: 'function f(options: Options) { return typeof (options satisfies Raw)!.retry === "number"; }',
      errors: [error],
      name: "satisfies expression on an owned binding",
    },
    {
      code: 'function f(options: unknown) { return typeof options!.retry === "number"; }',
      errors: [error],
      name: "non-null assertion on an unknown binding",
    },
    {
      code: 'function isString(value: unknown): value is string { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'function parse(value: unknown): string { if (typeof value !== "string") throw new Error(); return value; }',
      errors: [error],
      options: allowInTypeGuards,
    },
    {
      code: 'function isString(value: unknown): value is string { const check = () => typeof value === "string"; return check(); }',
      errors: [error],
      options: allowInTypeGuards,
    },
    {
      code: 'function check(values: unknown[]): boolean { return values.every((item) => typeof item === "string"); }',
      errors: [error],
      options: allowInTypeGuards,
    },
    {
      code: 'function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item): boolean => typeof item === "string"); }',
      errors: [error],
      options: allowInTypeGuards,
    },
    {
      code: 'const check: (value: unknown) => boolean = (value) => typeof value === "string";',
      errors: [error],
      options: allowInTypeGuards,
    },
    {
      code: 'const isText: (value: unknown) => value is string = (value) => typeof value === "string";',
      errors: [error],
    },
    { code: 'function f<T>(value: T) { return typeof value === "string"; }', errors: [error] },
    { code: 'const f = <T,>(value: T) => typeof value === "string";', errors: [error] },
    {
      code: 'function f<T extends unknown>(value: T) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'function f<T extends Record<string, any>>(value: T) { return typeof value.id === "string"; }',
      errors: [error],
    },
    {
      code: 'function f<T>(value: T | null) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'function f<T, U extends T>(value: U) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'function f<T>({ id }: T) { return typeof id === "string"; }',
      errors: [error],
    },
    {
      code: 'class Store<T> { has(value: T) { return typeof value === "string"; } }',
      errors: [error],
    },
    {
      code: 'type Data = unknown; export function f(value: Data) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'type Raw = unknown; type Data = Raw | null; function f(value: Data) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'type Loose = Record<string, any>; function f(value: Loose) { return typeof value.name === "string"; }',
      errors: [error],
    },
    {
      code: 'type Box<T> = T; function f(value: Box<unknown>) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'type Box<T> = T; type Data = unknown; function f(value: Box<Data>) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'type Payload<T> = { data: T; meta: unknown }; function f(value: Payload<string>) { return typeof value.data === "string"; }',
      errors: [error],
    },
    {
      code: 'type Options = { retry: unknown }; function f(options: Options) { const { retry } = options; return typeof retry === "number"; }',
      errors: [error],
    },
    {
      code: 'type Same<X> = X; function f<T>(value: Same<T>) { return typeof value === "string"; }',
      errors: [error],
    },
    {
      code: 'type Data = unknown; function f<T extends Data>(value: T) { return typeof value === "string"; }',
      errors: [error],
    },
  ],
  valid: [
    'function f<T extends string | number>(value: T) { return typeof value === "string"; }',
    'function f<T extends string, U extends T>(value: U) { return typeof value === "string"; }',
    'type T = string | number; function f(value: T) { return typeof value === "string"; }',
    'const isServer = typeof document === "undefined";',
    'const hasStorage = typeof localStorage !== "undefined";',
    'if (typeof globalThis.crypto === "undefined") throw new Error("no crypto");',
    'const missing = "undefined" === typeof process;',
    "const value = input;",
    'function delay(retry: number | RetryPolicy): number { return typeof retry === "number" ? retry : retry.delay; }',
    'async function resolve(headers: HeadersInit | (() => Promise<HeadersInit>)) { return typeof headers === "function" ? await headers() : headers; }',
    'function resolve(options: FetchTransportOptions) { return typeof (options.headers) === "function"; }',
    'function resolve(options?: FetchTransportOptions) { return typeof options!.headers === "function"; }',
    'function resolve(options?: FetchTransportOptions) { const { headers } = options!; return typeof headers === "function"; }',
    'function resolve(options: Config) { const { headers } = options.transport; return typeof headers === "function"; }',
    'function resolve({ headers }: FetchTransportOptions = {}) { return typeof headers === "function"; }',
    'function resolve(options?: TransportConfig) { return typeof options?.transport!.headers === "function"; }',
    'function resolve(options: FetchTransportOptions) { const { headers } = options; return typeof headers === "function"; }',
    'function resolve(options: FetchTransportOptions) { const { headers: init = {} } = options; return typeof init === "function"; }',
    'function resolve({ headers }: FetchTransportOptions) { return typeof headers === "function"; }',
    'function resolve(retry: number | RetryPolicy = 3) { return typeof retry === "number"; }',
    'class AsyncRun<T> { constructor(input: AsyncRunInput<T>) { this.run = typeof input === "function" ? input : input.try; } }',
    'declare const input: string | number; export const isText = typeof input === "string";',
    'type Input = string | (() => string); function f(value: Input) { return typeof value === "string" ? value : value(); }',
    'type Box<T> = T; function f(value: Box<string | number>) { return typeof value === "string"; }',
    'type Same<X> = X; function f<T extends string | number>(value: Same<T>) { return typeof value === "string"; }',
    'type Data = unknown; namespace Local { type Data = string | number; export function f(value: Data) { return typeof value === "string"; } }',
    // An imported alias has no declaration in the file, so the rule cannot see its body.
    'import type { Data } from "./data"; function f(value: Data) { return typeof value === "string"; }',
    {
      code: 'function isString(value: unknown): value is string { return typeof value === "string"; }',
      options: allowInTypeGuards,
    },
    {
      code: 'const isString = (value: unknown): value is string => typeof value === "string";',
      options: allowInTypeGuards,
    },
    {
      code: 'function assertString(value: unknown): asserts value is string { if (typeof value !== "string") throw new Error(); }',
      options: allowInTypeGuards,
    },
    {
      code: 'function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }',
      options: allowInTypeGuards,
    },
    {
      code: 'function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(function (item) { return typeof item === "string"; }); }',
      options: allowInTypeGuards,
    },
    {
      code: 'export const isText: (value: unknown) => value is string = (value) => typeof value === "string";',
      options: allowInTypeGuards,
    },
  ],
})
