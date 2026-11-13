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
  ],
  valid: [
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
