import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

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
  "quality/no-conditional-empty-object-spread",
  plugin.rules["no-conditional-empty-object-spread"],
  {
    invalid: [
      {
        code: "const result = { ...(value !== undefined ? { value } : {}) };",
        errors: [error],
        name: "report an empty object in the alternate branch",
      },
      {
        code: "const result = { ...(condition ? {} : { value }) };",
        errors: [error],
        name: "report an empty object in the consequent branch",
      },
      // `&&` spreads a falsy value, and `undefined` or `null` spreads nothing, like `{}`.
      {
        code: "const result = { ...(name && { name }) };",
        errors: [error],
        name: "report a logical and spread",
      },
      {
        code: "const result = { ...(name ? { name } : undefined) };",
        errors: [error],
        name: "report undefined in the alternate branch",
      },
      {
        code: "const result = { ...(condition ? { name } : null) };",
        errors: [error],
        name: "report null in the alternate branch",
      },
      {
        code: "const result = { ...(condition ? { name } : void 0) };",
        errors: [error],
        name: "report void 0 in the alternate branch",
      },
      {
        code: "const result = { ...(condition ? { name } : ({} satisfies Options)) };",
        errors: [error],
        name: "report an empty object under satisfies",
      },
      {
        code: "const result = { ...(condition ? { name } : ({} as Options)) };",
        errors: [error],
        name: "report an empty object under an as assertion",
      },
      {
        code: "const result = { ...(condition ? { name } : ok ? {} : {}) };",
        errors: [error],
        name: "report a nested conditional whose branches are both empty",
      },
      {
        code: "const result = { ...(condition ? { name } : ok ? { id } : {}) };",
        errors: [error],
        name: "report a nested conditional with an empty branch",
      },
      {
        code: "const result = { ...(condition ? (ok && { name }) : { id }) };",
        errors: [error],
        name: "report a logical and inside a conditional branch",
      },
      {
        code: "const EMPTY = {}; const result = { ...(condition ? { name } : EMPTY) };",
        errors: [error],
        name: "report a constant that holds an empty object",
      },
      {
        code: "const EMPTY = {}; const a = { ...(ok ? { name } : EMPTY) }; const b = { ...(ok ? (EMPTY as Options) : { id }) }; const c = { ...EMPTY };",
        errors: [error, error],
        name: "report each conditional spread of an empty constant",
      },
      {
        code: "const element = <div {...(ok ? { title } : {})} />;",
        errors: [error],
        name: "report a conditional JSX spread attribute",
        ...jsx,
      },
      {
        code: "const element = <div {...(title && { title })} />;",
        errors: [error],
        name: "report a logical and JSX spread attribute",
        ...jsx,
      },
    ],
    valid: [
      { code: "const result = { value };", name: "accept an object without a spread" },
      { code: "const result = { ...values };", name: "accept a spread of a binding" },
      {
        code: "const result = condition ? { value } : {};",
        name: "accept a conditional object outside a spread",
      },
      {
        code: "const result = { ...(condition ? { name } : { id }) };",
        name: "accept a conditional spread whose branches both hold properties",
      },
      {
        code: "const result = { ...(options ?? {}) };",
        name: "accept a nullish fallback to an empty object",
      },
      {
        code: "const result = { ...(options || {}) };",
        name: "accept a logical or fallback to an empty object",
      },
      {
        code: "const result = condition ? { name } : undefined;",
        name: "accept a conditional that yields undefined outside a spread",
      },
      {
        code: "const result = [...(condition ? items : [])];",
        name: "accept a conditional array spread",
      },
      {
        code: "const DEFAULTS = { id: 1 }; const result = { ...(condition ? { name } : DEFAULTS) };",
        name: "accept a constant fallback that holds properties",
      },
      {
        code: "let empty = {}; empty = { id: 1 }; const result = { ...(condition ? { name } : empty) };",
        name: "accept a fallback binding that the code reassigns",
      },
      // Code can fill a constant that holds `{}` before the spread reads it.
      {
        code: 'const fallback: { id?: number } = {}; fallback.id = 1; const result = { ...(ok ? { name: "x" } : fallback) };',
        name: "accept a fallback object that the code mutates through a property",
      },
      {
        code: 'const fallback: { id?: number } = {}; Object.assign(fallback, { id: 1 }); const result = { ...(ok ? { name: "x" } : fallback) };',
        name: "accept a fallback object that Object.assign fills",
      },
      {
        code: "const fallback = {}; fill(fallback); const result = { ...(ok ? { name } : fallback) };",
        name: "accept a fallback object passed to a function",
      },
      {
        code: "function build(undefined: Options) { return { ...(condition ? { name } : undefined) }; }",
        name: "accept a parameter named undefined",
      },
      {
        code: "const element = <div {...props} />;",
        name: "accept a JSX spread of a binding",
        ...jsx,
      },
      {
        code: "const element = <div title={ok ? title : undefined} />;",
        name: "accept a conditional JSX attribute value",
        ...jsx,
      },
    ],
  }
)
