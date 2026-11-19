import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "widenThenAssert" }

tester.run("no-widen-then-assert", plugin.rules["no-widen-then-assert"], {
  invalid: [
    {
      code: "const source = { id: 'second' }; const widened: unknown = source; const parsed = widened as { readonly id: string };",
      errors: [error],
      name: "report an assertion of a binding that the code widened to unknown",
    },
    {
      code: 'const raw: unknown = "abc"; parsePort(raw as number);',
      errors: [/`\/\/ @ts-expect-error -- reason`/u],
      name: "report an assertion of an unknown literal with a message that names the expect-error escape",
    },
    {
      code: 'describe("user", () => {\n  const user: User = { id: "1" }\n  const widened: unknown = user\n  it("reads id", () => {\n    console.info((widened as User).id)\n  })\n})',
      errors: [error],
      name: "report an assertion in a test callback nested in the declaring function",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; function read() { return widened as { readonly id: string }; }",
      errors: [error],
      name: "report a module binding asserted inside a function",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; const read = () => () => widened as { readonly id: string };",
      errors: [error],
      name: "report a module binding asserted two functions deep",
    },
    {
      code: "const widened: globalThis.Record<string, unknown> = { id: 'first' }; const parsed = widened as { readonly id: string };",
      errors: [error],
      name: "report a binding widened to globalThis.Record",
    },
    {
      code: "const widened: globalThis.Readonly<Record<globalThis.PropertyKey, unknown>> = { id: 'first' }; const parsed = widened as Record<string, string>;",
      errors: [error],
      name: "report a binding widened to globalThis.Readonly with a globalThis.PropertyKey key",
    },
    {
      code: "const widened: Record<string, unknown> = { id: 'first' }; const parsed = widened as globalThis.Record<string, string>;",
      errors: [error],
      name: "report a binding asserted to globalThis.Record with a narrower value",
    },
  ],
  valid: [
    {
      code: "const source = { id: 'first' }; const widened: unknown = source;",
      name: "accept a widened binding without an assertion",
    },
    {
      code: "declare const input: unknown; const parsed = input as { readonly id: string };",
      name: "accept an assertion of a value that was never widened",
    },
    {
      code: "function read() { return widened as { readonly id: string }; } const source = { id: 'first' }; const widened: unknown = source;",
      name: "accept an assertion before the declaration",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; function read(widened: unknown) { return widened as { readonly id: string }; }",
      name: "accept a parameter that shadows the widened binding",
    },
    {
      code: "let source = { id: 'first' }; source = { id: 'second' }; const widened: unknown = source; function read() { return widened as { readonly id: string }; }",
      name: "accept a binding widened from a reassigned binding",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; const parsed = widened as globalThis.Record<string, unknown>;",
      name: "accept an assertion to globalThis.Record of unknown, which is not narrower",
    },
    {
      code: "const widened: Lib.Record<string, unknown> = { id: 'first' }; const parsed = widened as { readonly id: string };",
      name: "accept a binding annotated with a namespace type that is not globalThis",
    },
  ],
})
