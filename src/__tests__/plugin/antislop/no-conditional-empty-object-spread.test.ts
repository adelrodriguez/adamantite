import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "avoid" }
const jsx = { languageOptions: { parserOptions: { lang: "tsx" as const } } }

if (plugin.rules["no-conditional-empty-object-spread"].meta?.fixable !== undefined) {
  throw new Error("The rule must not offer an unsafe semantics-changing fix.")
}

tester.run(
  "anti-slop/no-conditional-empty-object-spread",
  plugin.rules["no-conditional-empty-object-spread"],
  {
    invalid: [
      {
        code: "const result = { ...(value !== undefined ? { value } : {}) };",
        errors: [error],
      },
      {
        code: "const result = { ...(condition ? {} : { value }) };",
        errors: [error],
      },
      // `&&` spreads a falsy value, and `undefined` or `null` spreads nothing, like `{}`.
      { code: "const result = { ...(name && { name }) };", errors: [error] },
      { code: "const result = { ...(name ? { name } : undefined) };", errors: [error] },
      { code: "const result = { ...(condition ? { name } : null) };", errors: [error] },
      { code: "const result = { ...(condition ? { name } : void 0) };", errors: [error] },
      // A type operator or a nested conditional does not change what the branch spreads.
      {
        code: "const result = { ...(condition ? { name } : ({} satisfies Options)) };",
        errors: [error],
      },
      { code: "const result = { ...(condition ? { name } : ({} as Options)) };", errors: [error] },
      { code: "const result = { ...(condition ? { name } : ok ? {} : {}) };", errors: [error] },
      { code: "const result = { ...(condition ? { name } : ok ? { id } : {}) };", errors: [error] },
      { code: "const result = { ...(condition ? (ok && { name }) : { id }) };", errors: [error] },
      // A constant that holds `{}` is the same empty branch.
      {
        code: "const EMPTY = {}; const result = { ...(condition ? { name } : EMPTY) };",
        errors: [error],
      },
      // A JSX spread attribute omits an attribute the same way.
      { code: "const element = <div {...(ok ? { title } : {})} />;", errors: [error], ...jsx },
      { code: "const element = <div {...(title && { title })} />;", errors: [error], ...jsx },
    ],
    valid: [
      "const result = { value };",
      "const result = { ...values };",
      "const result = condition ? { value } : {};",
      "const result = { ...(condition ? { name } : { id }) };",
      "const result = { ...(options ?? {}) };",
      "const result = { ...(options || {}) };",
      "const result = condition ? { name } : undefined;",
      "const result = [...(condition ? items : [])];",
      "const DEFAULTS = { id: 1 }; const result = { ...(condition ? { name } : DEFAULTS) };",
      "let empty = {}; empty = { id: 1 }; const result = { ...(condition ? { name } : empty) };",
      "function build(undefined: Options) { return { ...(condition ? { name } : undefined) }; }",
      { code: "const element = <div {...props} />;", ...jsx },
      { code: "const element = <div title={ok ? title : undefined} />;", ...jsx },
    ],
  }
)
