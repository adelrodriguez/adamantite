import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "reflectApply" }

tester.run("no-reflect-apply", plugin.rules["no-reflect-apply"], {
  invalid: [
    { code: "const value = Reflect.apply(operation, owner, args);", errors: [error] },
    { code: "const value = Reflect['apply'](operation, owner, args);", errors: [error] },
    {
      code: "const { apply } = Reflect; const value = apply(operation, owner, args);",
      errors: [error],
      name: "method destructured from Reflect",
    },
    {
      code: "const R = Reflect; const value = R.apply(operation, owner, args);",
      errors: [error],
      name: "constant alias of Reflect",
    },
    {
      code: "const value = globalThis.Reflect.apply(operation, owner, args);",
      errors: [error],
      name: "Reflect read from globalThis",
    },
    {
      code: "const value = Reflect.apply.call(null, operation, owner, args);",
      errors: [error],
      name: "method called with call",
    },
    {
      code: "const value = Reflect.apply.apply(null, [operation, owner, args]);",
      errors: [error],
      name: "method called with apply",
    },
    {
      code: "const value = Reflect[`apply`](operation, owner, args);",
      errors: [error],
      name: "template literal key",
    },
  ],
  valid: [
    "const value = operation.apply(owner, args);",
    "Reflect.get(owner, key);",
    {
      code: "const value = Reflect.get.apply(null, [owner, key]);",
      name: "apply on another Reflect method",
    },
    {
      code: "const { apply } = other; const value = apply(operation, owner, args);",
      name: "method destructured from another object",
    },
    {
      code: "function invoke(globalThis) { return globalThis.Reflect.apply(operation, owner, args); }",
      name: "parameter that shadows globalThis",
    },
    "const Reflect = { apply() { return 1; } }; Reflect.apply();",
    "function invoke(Reflect: { apply(): number }) { return Reflect.apply(); }",
  ],
})
