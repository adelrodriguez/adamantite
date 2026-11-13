import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

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
      code: 'task["catch"]((error: unknown) => String(error));',
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
      code: 'function read(value: unknown): User { return schema["parse"](value); }',
      errors: [{ ...error, data: { parameter: "value" } }],
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
  ],
  valid: [
    "function enrich(cause: unknown): void {}",
    "function enrich(cause: Error | unknown): void {}",
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
  ],
})
