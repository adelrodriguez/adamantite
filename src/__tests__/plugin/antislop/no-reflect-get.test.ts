import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugin/antislop/index.ts"

RuleTester.describe = describe

RuleTester.it = it

RuleTester.itOnly = it.only

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } })
const error = { messageId: "reflectGet" }

tester.run("no-reflect-get", plugin.rules["no-reflect-get"], {
  invalid: [
    { code: "const value = Reflect.get(owner, key);", errors: [error], name: "static access" },
    { code: "const value = Reflect['get'](owner, key);", errors: [error], name: "computed access" },
    {
      code: "const value = Reflect.get(owner, key, owner);",
      errors: [error],
      name: "receiver that repeats the target",
    },
    {
      code: "const value = Reflect.get(owner, ...rest);",
      errors: [error],
      name: "spread arguments",
    },
  ],
  valid: [
    {
      code: "const proxy = new Proxy(target, { get(obj, key, receiver) { return Reflect.get(obj, key, receiver); } });",
      name: "Proxy get trap that forwards the receiver",
    },
    {
      code: "const value = Reflect['get'](owner, key, receiver);",
      name: "computed access with a receiver",
    },
    "const value = owner.property;",
    "const value = owner[key];",
    "Reflect.set(owner, key, value);",
    "const Reflect = { get() { return 1; } }; Reflect.get();",
    "function read(Reflect: { get(): number }) { return Reflect.get(); }",
  ],
})
