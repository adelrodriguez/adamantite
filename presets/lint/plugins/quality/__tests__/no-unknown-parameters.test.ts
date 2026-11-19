import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "unknownParameter" }

tester.run("no-unknown-parameters", plugin.rules["no-unknown-parameters"], {
  invalid: [
    {
      code: "function parse(value: unknown): void {}",
      errors: [error],
      name: "report an unknown parameter",
    },
    {
      code: "function parse(value: string | unknown): void {}",
      errors: [error],
      name: "report a union with unknown",
    },
    {
      code: "function parse(value: string | (number | unknown)): void {}",
      errors: [error],
      name: "report a nested union with unknown",
    },
    {
      code: "function isString(value: unknown, context: unknown): value is string { return true; }",
      errors: [{ ...error, data: { parameter: "context" } }],
      name: "report a second unknown parameter of a type guard",
    },
    {
      code: "task.then((value: unknown) => String(value));",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report a then fulfillment handler",
    },
    {
      code: "task.catch((error: unknown, context: unknown) => String(context));",
      errors: [{ ...error, data: { parameter: "context" } }],
      name: "report a second unknown parameter of a catch handler",
    },
    {
      code: "function describe(error: unknown): string { return String(error); }\ntask.catch(describe);",
      errors: [{ ...error, data: { parameter: "error" } }],
      name: "report a named function passed to catch",
    },
    {
      code: "export function parse({ value }: unknown = {}): void {}",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
      name: "report a destructured parameter with a default",
    },
    {
      code: "function read(value: unknown): string { return value.id; }",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report a property read of an unknown value",
    },
    {
      code: "function read(value: unknown): void { schema.parse(value); return send(value); }",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report a value used after a parse",
    },
    {
      code: "function read({ value }: unknown): User { return schema.parse(value); }",
      errors: [{ ...error, data: { parameter: "{ value }" } }],
      name: "report a destructured parameter passed to parse",
    },
    {
      code: "function read(value: unknown): User { return parse(value); }",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report a value passed to a local function named parse",
    },
    {
      code: "function read(value: unknown): User { return Schema.decodeUnknownSync(value)(User); }",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report a value passed as the schema to Schema.decodeUnknownSync",
    },
    {
      code: "let decode = Schema.decodeUnknownSync(User);\nfunction read(input: unknown): User { return decode(input); }",
      errors: [{ ...error, data: { parameter: "input" } }],
      name: "report a value passed to a decoder binding that the code can reassign",
    },
    {
      code: "const decode = makeDecoder(User);\nfunction read(input: unknown): User { return decode(input); }",
      errors: [{ ...error, data: { parameter: "input" } }],
      name: "report a value passed to a decoder from an unknown factory",
    },
    {
      code: "function read(value: unknown): User { value = fallback; return schema.parse(value); }",
      errors: [{ ...error, data: { parameter: "value" } }],
      name: "report a value that the code reassigns before a parse",
    },
    {
      code: "function toError(error: unknown): Error { return error instanceof Error ? error : send(error); }",
      errors: [{ ...error, data: { parameter: "error" } }],
      name: "report an error passed to a function after an instanceof check",
    },
    {
      code: "function toError(error: unknown): string { return error instanceof Error ? String(error) : error.message; }",
      errors: [{ ...error, data: { parameter: "error" } }],
      name: "report a property read of an error in the branch that instanceof does not narrow",
    },
    {
      code: "type Input = unknown; function parse(input: Input): void {}",
      errors: [error],
      name: "report an alias of unknown",
    },
    {
      code: "type Box<T> = T; function parse(input: Box<unknown>): void {}",
      errors: [error],
      name: "report an identity alias of unknown",
    },
    {
      code: "function parse(input: NoInfer<unknown>): void {}",
      errors: [error],
      name: "report NoInfer of unknown",
    },
    {
      code: "function parse(input: Awaited<unknown>): void {}",
      errors: [error],
      name: "report Awaited of unknown",
    },
    {
      code: "function parse(input: string | Awaited<unknown>): void {}",
      errors: [error],
      name: "report a union with Awaited of unknown",
    },
    {
      code: "export function parse(cause: unknown): string { return String(cause); }",
      errors: [{ ...error, data: { parameter: "cause" } }],
      name: "report a cause parameter of an exported function that returns a string",
    },
    {
      code: "function enrich(cause: unknown): void {}",
      errors: [error],
      name: "report a cause parameter of a function that returns void",
    },
    {
      code: "function enrich(cause: Error | unknown): void {}",
      errors: [error],
      name: "report a cause parameter typed as a union with unknown in a function that returns void",
    },
    {
      code: "const parse = (cause: unknown): string => String(cause);",
      errors: [error],
      name: "report a cause parameter of an arrow that returns a string",
    },
    {
      code: "class Parser { parse(cause: unknown): void {} }",
      errors: [error],
      name: "report a cause parameter of a method that returns void",
    },
    {
      code: "function becauseOf(cause: unknown): void {}",
      errors: [error],
      name: "report a function name that holds cause inside another word",
    },
    {
      code: "function errorsOf(cause: unknown): void {}",
      errors: [error],
      name: "report a function name that holds error inside another word",
    },
    {
      code: "class AppError extends Error { constructor(message: string, detail: unknown) { super(message); } }",
      errors: [{ ...error, data: { parameter: "detail" } }],
      name: "report a non-cause parameter of an Error subclass constructor",
    },
    {
      code: "function toError(cause: unknown, context: unknown): Error { return new Error(String(context)); }",
      errors: [{ ...error, data: { parameter: "context" } }],
      name: "report a second unknown parameter of a function that returns an Error",
    },
  ],
  valid: [
    {
      code: 'task["catch"]((error: unknown) => String(error));',
      name: "accept a catch handler called through a string key",
    },
    {
      code: "task[`then`]((value) => value, (error: unknown) => String(error));",
      name: "accept a then rejection handler called through a template literal key",
    },
    {
      code: "function read(value: unknown): User { return schema[`parse`](value); }",
      name: "accept a value passed to parse through a template literal key",
    },
    {
      code: 'function read(value: unknown): User { return schema["parse"](value); }',
      name: "accept a value passed to parse through a string key",
    },
    {
      code: "class Report { [`formatCause`](cause: unknown): string { return String(cause); } }",
      name: "accept a cause parameter of a method named through a template literal key",
    },
    {
      code: "class AppError extends Error { constructor(message: string, cause: unknown) { super(message, { cause }); } }",
      name: "accept a cause parameter of an Error subclass constructor",
    },
    {
      code: "declare class AppError { constructor(message: string, cause: unknown); }",
      name: "accept a cause parameter of a declared class constructor",
    },
    {
      code: "interface AppErrorConstructor { new (message: string, cause: unknown): Error }",
      name: "accept a cause parameter of a construct signature",
    },
    {
      code: "type AppErrorConstructor = new (message: string, cause: unknown) => Error;",
      name: "accept a cause parameter of a constructor type",
    },
    {
      code: "class AppError extends Error { static from(cause: unknown): AppError { return new AppError(String(cause)); } }",
      name: "accept a cause parameter of a static factory that returns the error",
    },
    {
      code: "function toError(cause: unknown): Error { return new Error(String(cause)); }",
      name: "accept a cause parameter of a function that returns an Error",
    },
    {
      code: "const toError = (cause: unknown): Error => new Error(String(cause));",
      name: "accept a cause parameter of an arrow that returns an Error",
    },
    {
      code: "function toError(cause: Error | unknown): Error { return new Error(String(cause)); }",
      name: "accept a cause parameter typed as a union with unknown",
    },
    {
      code: "function formatCauseDetail(cause: unknown): string { return String(cause); }",
      name: "accept a cause parameter of a function named for a cause",
    },
    {
      code: "function causeLines(cause: unknown): string[] { return [String(cause)]; }",
      name: "accept a cause parameter of a function named for cause lines",
    },
    {
      code: 'function fail(options: { cause: unknown }): never { throw new Error("failed", options); }',
      name: "accept an options object with an unknown cause",
    },
    {
      code: "function isString(value: unknown): value is string { return true; }",
      name: "accept a type guard parameter",
    },
    {
      code: "const isString = (value: unknown): value is string => true;",
      name: "accept a type guard arrow parameter",
    },
    {
      code: "function assertString(value: unknown): asserts value is string {}",
      name: "accept an assertion function parameter",
    },
    {
      code: "type Guard = (value: unknown) => value is string;",
      name: "accept a type guard function type parameter",
    },
    {
      code: "declare function isString(value: unknown): value is string;",
      name: "accept a declared type guard parameter",
    },
    {
      code: "type Guards = { isString(value: unknown): value is string };",
      name: "accept a type guard method signature parameter",
    },
    {
      code: "function parse(value: string | number): void {}",
      name: "accept a union of known types",
    },
    { code: "task.catch((error: unknown) => String(error));", name: "accept a catch handler" },
    {
      code: "task.catch(function describe(error: unknown) { return String(error); });",
      name: "accept a named function expression as a catch handler",
    },
    {
      code: "task?.catch((error: unknown) => String(error));",
      name: "accept an optional catch call",
    },
    {
      code: "task.then((value) => value, (error: unknown) => String(error));",
      name: "accept a then rejection handler",
    },
    {
      code: `export function addressChannel<Channel extends ChannelName>(channel: Channel, params: unknown) {
      const parsed = z.safeParse(getChannel(channel).params, params)
      if (!parsed.success) return { error: parsed.error }
      return { key: \`\${channel}:\${JSON.stringify(sortKeys(parsed.data))}\`, params: parsed.data }
    }`,
      name: "accept an unknown value that z.safeParse checks before use",
    },
    {
      code: "function read(value: unknown): User { return schema.parse(value); }",
      name: "accept a value passed to schema.parse",
    },
    {
      code: "const read = async (value: unknown) => schema.safeParseAsync(value);",
      name: "accept a value passed to safeParseAsync",
    },
    {
      code: "function read(value: unknown): boolean { return ajv.validate(schema, value); }",
      name: "accept a value passed to ajv.validate",
    },
    {
      code: "function read(value: unknown): User { return Schema.decodeUnknownSync(User)(value); }",
      name: "accept a value passed to Schema.decodeUnknownSync",
    },
    {
      code: "function check(value: unknown): boolean { return Schema.is(User)(value); }",
      name: "accept a value passed to Schema.is",
    },
    {
      code: "const decode = Schema.decodeUnknownSync(User);\nfunction read(input: unknown): User { return decode(input); }",
      name: "accept a value passed to a constant decoder",
    },
    {
      code: "function read(value: unknown): User { return value instanceof User ? value : schema.parse(value); }",
      name: "accept a value narrowed by instanceof before a parse",
    },
    {
      code: "function toError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }",
      name: "accept an error narrowed by instanceof before it becomes an Error",
    },
    {
      code: "type Box<T> = { readonly value: T }; function parse(input: Box<unknown>): void {}",
      name: "accept a generic object type that holds unknown",
    },
    {
      code: "type Input = unknown; function parse<Input>(input: Input): void {}",
      name: "accept a type parameter that shadows an alias of unknown",
    },
    {
      code: 'import type { Input } from "./input"; function parse(input: Input): void {}',
      name: "accept an imported parameter type",
    },
    {
      code: "interface NoInfer<T> { readonly value: T } function parse(input: NoInfer<unknown>): void {}",
      name: "accept a local NoInfer interface of unknown",
    },
  ],
})
