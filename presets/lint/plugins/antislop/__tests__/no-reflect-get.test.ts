import { RuleTester } from "oxlint/plugins-dev"
import { describe, it } from "vitest"
import plugin from "#presets/lint/plugins/antislop/index.ts"

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
    {
      code: "const { get } = Reflect; const value = get(owner, key);",
      errors: [error],
      name: "method destructured from Reflect",
    },
    {
      code: "const { get: read } = Reflect; const value = read(owner, key);",
      errors: [error],
      name: "method destructured from Reflect under another name",
    },
    {
      code: "const R = Reflect; const value = R.get(owner, key);",
      errors: [error],
      name: "constant alias of Reflect",
    },
    {
      code: "const read = Reflect.get; const value = read(owner, key);",
      errors: [error],
      name: "constant alias of the method",
    },
    {
      code: "const value = globalThis.Reflect.get(owner, key);",
      errors: [error],
      name: "Reflect read from globalThis",
    },
    {
      code: "const { get } = globalThis.Reflect; const value = get(owner, key);",
      errors: [error],
      name: "method destructured from globalThis.Reflect",
    },
    {
      code: "const value = Reflect.get.call(null, owner, key);",
      errors: [error],
      name: "method called with call",
    },
    {
      code: "const value = Reflect.get.call(null, owner, key, owner);",
      errors: [error],
      name: "method called with call and a receiver that repeats the target",
    },
    {
      code: "const value = Reflect.get.apply(null, [owner, key]);",
      errors: [error],
      name: "method called with apply",
    },
    {
      code: "const value = Reflect.get.apply(null, args);",
      errors: [error],
      name: "method called with apply and an argument list that the rule cannot read",
    },
    {
      code: "const value = Reflect[`get`](owner, key);",
      errors: [error],
      name: "template literal key",
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
    {
      code: "const R = Reflect; const value = R.get(owner, key, receiver);",
      name: "constant alias of Reflect with a receiver",
    },
    {
      code: "const value = Reflect.get.call(null, owner, key, receiver);",
      name: "method called with call and a receiver",
    },
    {
      code: "const value = Reflect.get.apply(null, [owner, key, receiver]);",
      name: "method called with apply and a receiver",
    },
    {
      code: "let R = Reflect; R = other; const value = R.get(owner, key);",
      name: "variable that the code reassigns",
    },
    {
      code: "const { get } = other; const value = get(owner, key);",
      name: "method destructured from another object",
    },
    {
      code: "const { get } = Reflect; function read(get) { return get(owner, key); }",
      name: "parameter that shadows the destructured method",
    },
    {
      code: "function read(globalThis) { return globalThis.Reflect.get(owner, key); }",
      name: "parameter that shadows globalThis",
    },
    {
      code: `const value = Reflect[\`\${name}\`](owner, key);`,
      name: "template literal key with an expression",
    },
    {
      code: "const { set } = Reflect; set(owner, key, value);",
      name: "other method destructured from Reflect",
    },
    "Reflect.set.call(null, owner, key, value);",
    "const value = owner.property;",
    "const value = owner[key];",
    "Reflect.set(owner, key, value);",
    "const Reflect = { get() { return 1; } }; Reflect.get();",
    "function read(Reflect: { get(): number }) { return Reflect.get(); }",
  ],
})
