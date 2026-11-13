import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

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
    },
    {
      code: 'const raw: unknown = "abc"; parsePort(raw as number);',
      errors: [/`\/\/ @ts-expect-error -- reason`/u],
      name: "invalid input on purpose names the expect-error escape",
    },
    {
      code: 'describe("user", () => {\n  const user: User = { id: "1" }\n  const widened: unknown = user\n  it("reads id", () => {\n    console.info((widened as User).id)\n  })\n})',
      errors: [error],
      name: "assertion in a test callback nested in the declaring function",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; function read() { return widened as { readonly id: string }; }",
      errors: [error],
      name: "module binding asserted inside a function",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; const read = () => () => widened as { readonly id: string };",
      errors: [error],
      name: "module binding asserted two functions deep",
    },
  ],
  valid: [
    "const source = { id: 'first' }; const widened: unknown = source;",
    "declare const input: unknown; const parsed = input as { readonly id: string };",
    {
      code: "function read() { return widened as { readonly id: string }; } const source = { id: 'first' }; const widened: unknown = source;",
      name: "assertion before the declaration",
    },
    {
      code: "const source = { id: 'first' }; const widened: unknown = source; function read(widened: unknown) { return widened as { readonly id: string }; }",
      name: "parameter that shadows the widened binding",
    },
    {
      code: "let source = { id: 'first' }; source = { id: 'second' }; const widened: unknown = source; function read() { return widened as { readonly id: string }; }",
      name: "widened from a reassigned binding",
    },
  ],
})
