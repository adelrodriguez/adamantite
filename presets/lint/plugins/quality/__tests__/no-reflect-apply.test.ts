import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/quality/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "reflectApply" }

tester.run("no-reflect-apply", plugin.rules["no-reflect-apply"], {
  invalid: [
    {
      code: "const value = Reflect.apply(operation, owner, args);",
      errors: [error],
      name: "report Reflect.apply",
    },
    {
      code: "const value = Reflect['apply'](operation, owner, args);",
      errors: [error],
      name: "report Reflect.apply through a string key",
    },
    {
      code: "const { apply } = Reflect; const value = apply(operation, owner, args);",
      errors: [error],
      name: "report a method destructured from Reflect",
    },
    {
      code: "const R = Reflect; const value = R.apply(operation, owner, args);",
      errors: [error],
      name: "report a constant alias of Reflect",
    },
    {
      code: "const value = globalThis.Reflect.apply(operation, owner, args);",
      errors: [error],
      name: "report Reflect read from globalThis",
    },
    {
      code: "const value = Reflect.apply.call(null, operation, owner, args);",
      errors: [error],
      name: "report the method called with call",
    },
    {
      code: "const value = Reflect.apply.apply(null, [operation, owner, args]);",
      errors: [error],
      name: "report the method called with apply",
    },
    {
      code: "const value = Reflect[`apply`](operation, owner, args);",
      errors: [error],
      name: "report Reflect.apply through a template literal key",
    },
  ],
  valid: [
    {
      code: "const value = operation.apply(owner, args);",
      name: "accept Function.prototype.apply",
    },
    { code: "Reflect.get(owner, key);", name: "accept another Reflect method" },
    {
      code: "const value = Reflect.get.apply(null, [owner, key]);",
      name: "accept apply on another Reflect method",
    },
    {
      code: "const { apply } = other; const value = apply(operation, owner, args);",
      name: "accept a method destructured from another object",
    },
    {
      code: "function invoke(globalThis) { return globalThis.Reflect.apply(operation, owner, args); }",
      name: "accept a parameter that shadows globalThis",
    },
    {
      code: "const Reflect = { apply() { return 1; } }; Reflect.apply();",
      name: "accept a local Reflect binding",
    },
    {
      code: "function invoke(Reflect: { apply(): number }) { return Reflect.apply(); }",
      name: "accept a parameter named Reflect",
    },
  ],
})
