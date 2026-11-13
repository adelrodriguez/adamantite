import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/anti-slop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownParameter" }

tester.run("no-unknown-parameters", plugin.rules["no-unknown-parameters"], {
  invalid: [
    { code: "function parse(value: unknown): void {}", errors: [error] },
    { code: "function parse(value: string | unknown): void {}", errors: [error] },
    {
      code: "function parse(value: string | (number | unknown)): void {}",
      errors: [error],
    },
    {
      code: "function isString(value: unknown, context: unknown): value is string { return true; }",
      errors: [{ ...error, data: { parameter: "context" } }],
    },
    {
      code: "task.then((value: unknown) => String(value));",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "task.catch((error: unknown, context: unknown) => String(context));",
      errors: [{ ...error, data: { parameter: "context" } }],
    },
    {
      code: "function describe(error: unknown): string { return String(error); }\ntask.catch(describe);",
      errors: [{ ...error, data: { parameter: "error" } }],
    },
    {
      code: "export function parse({ value }: unknown = {}): void {}",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
    },
    {
      code: "function read(value: unknown): string { return value.id; }",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "function read(value: unknown): void { schema.parse(value); return send(value); }",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "function read({ value }: unknown): User { return schema.parse(value); }",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
    },
    {
      code: "function read(value: unknown): User { return parse(value); }",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "function read(value: unknown): User { return Schema.decodeUnknownSync(value)(User); }",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "let decode = Schema.decodeUnknownSync(User);\nfunction read(input: unknown): User { return decode(input); }",
      errors: [{ ...error, data: { parameter: "input" } }],
    },
    {
      code: "const decode = makeDecoder(User);\nfunction read(input: unknown): User { return decode(input); }",
      errors: [{ ...error, data: { parameter: "input" } }],
    },
    {
      code: "function read(value: unknown): User { value = fallback; return schema.parse(value); }",
      errors: [{ ...error, data: { parameter: "value" } }],
    },
    {
      code: "function toError(error: unknown): Error { return error instanceof Error ? error : send(error); }",
      errors: [{ ...error, data: { parameter: "error" } }],
    },
    {
      code: "function toError(error: unknown): string { return error instanceof Error ? String(error) : error.message; }",
      errors: [{ ...error, data: { parameter: "error" } }],
    },
    { code: "type Input = unknown; function parse(input: Input): void {}", errors: [error] },
    { code: "type Box<T> = T; function parse(input: Box<unknown>): void {}", errors: [error] },
    { code: "function parse(input: NoInfer<unknown>): void {}", errors: [error] },
    { code: "function parse(input: Awaited<unknown>): void {}", errors: [error] },
    { code: "function parse(input: string | Awaited<unknown>): void {}", errors: [error] },
    {
      code: "export function parse(cause: unknown): string { return String(cause); }",
      errors: [{ ...error, data: { parameter: "cause" } }],
    },
    { code: "function enrich(cause: unknown): void {}", errors: [error] },
    { code: "function enrich(cause: Error | unknown): void {}", errors: [error] },
    { code: "const parse = (cause: unknown): string => String(cause);", errors: [error] },
    { code: "class Parser { parse(cause: unknown): void {} }", errors: [error] },
    { code: "function becauseOf(cause: unknown): void {}", errors: [error] },
    { code: "function errorsOf(cause: unknown): void {}", errors: [error] },
    {
      code: "class AppError extends Error { constructor(message: string, detail: unknown) { super(message); } }",
      errors: [{ ...error, data: { parameter: "detail" } }],
    },
    {
      code: "function toError(cause: unknown, context: unknown): Error { return new Error(String(context)); }",
      errors: [{ ...error, data: { parameter: "context" } }],
    },
  ],
  valid: [
    'task["catch"]((error: unknown) => String(error));',
    "task[`then`]((value) => value, (error: unknown) => String(error));",
    "function read(value: unknown): User { return schema[`parse`](value); }",
    'function read(value: unknown): User { return schema["parse"](value); }',
    "class Report { [`formatCause`](cause: unknown): string { return String(cause); } }",
    "class AppError extends Error { constructor(message: string, cause: unknown) { super(message, { cause }); } }",
    "declare class AppError { constructor(message: string, cause: unknown); }",
    "interface AppErrorConstructor { new (message: string, cause: unknown): Error }",
    "type AppErrorConstructor = new (message: string, cause: unknown) => Error;",
    "class AppError extends Error { static from(cause: unknown): AppError { return new AppError(String(cause)); } }",
    "function toError(cause: unknown): Error { return new Error(String(cause)); }",
    "const toError = (cause: unknown): Error => new Error(String(cause));",
    "function toError(cause: Error | unknown): Error { return new Error(String(cause)); }",
    "function formatCauseDetail(cause: unknown): string { return String(cause); }",
    "function causeLines(cause: unknown): string[] { return [String(cause)]; }",
    'function fail(options: { cause: unknown }): never { throw new Error("failed", options); }',
    "function isString(value: unknown): value is string { return true; }",
    "const isString = (value: unknown): value is string => true;",
    "function assertString(value: unknown): asserts value is string {}",
    "type Guard = (value: unknown) => value is string;",
    "declare function isString(value: unknown): value is string;",
    "type Guards = { isString(value: unknown): value is string };",
    "function parse(value: string | number): void {}",
    "task.catch((error: unknown) => String(error));",
    "task.catch(function describe(error: unknown) { return String(error); });",
    "task?.catch((error: unknown) => String(error));",
    "task.then((value) => value, (error: unknown) => String(error));",
    `export function addressChannel<Channel extends ChannelName>(channel: Channel, params: unknown) {
      const parsed = z.safeParse(getChannel(channel).params, params)
      if (!parsed.success) return { error: parsed.error }
      return { key: \`\${channel}:\${JSON.stringify(sortKeys(parsed.data))}\`, params: parsed.data }
    }`,
    "function read(value: unknown): User { return schema.parse(value); }",
    "const read = async (value: unknown) => schema.safeParseAsync(value);",
    "function read(value: unknown): boolean { return ajv.validate(schema, value); }",
    "function read(value: unknown): User { return Schema.decodeUnknownSync(User)(value); }",
    "function check(value: unknown): boolean { return Schema.is(User)(value); }",
    "const decode = Schema.decodeUnknownSync(User);\nfunction read(input: unknown): User { return decode(input); }",
    "function read(value: unknown): User { return value instanceof User ? value : schema.parse(value); }",
    "function toError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }",
    "type Box<T> = { readonly value: T }; function parse(input: Box<unknown>): void {}",
    "type Input = unknown; function parse<Input>(input: Input): void {}",
    'import type { Input } from "./input"; function parse(input: Input): void {}',
    "interface NoInfer<T> { readonly value: T } function parse(input: NoInfer<unknown>): void {}",
  ],
})
