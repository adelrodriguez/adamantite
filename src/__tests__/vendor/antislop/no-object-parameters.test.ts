import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-object-parameters", {
  invalid: [
    {
      code: "export function consume(value: object = {}): void {}",
      errors: [{ column: 31, data: { parameter: "value" }, line: 1, messageId: "objectParameter" }],
    },
    {
      code: "type Bag = object\nexport function consume({ value }: Bag): void {}",
      errors: [
        { column: 35, data: { parameter: "{ value }" }, line: 2, messageId: "objectParameter" },
      ],
    },
    {
      code: "type Identity<T> = T\nexport function consume(value: Identity<object>) {}",
      errors: [{ column: 31, data: { parameter: "value" }, line: 2, messageId: "objectParameter" }],
    },
    {
      code: "type Alias = object\nexport function consume(value: Alias) {}",
      errors: [{ column: 31, data: { parameter: "value" }, line: 2, messageId: "objectParameter" }],
    },
    {
      code: "export function consume(value: object) {}",
      errors: [{ column: 31, data: { parameter: "value" }, line: 1, messageId: "objectParameter" }],
    },
  ],
  valid: [
    "export type Alias = object",
    "export function consume<Value extends object>(value: Value) {}",
    "interface Owner { readonly id: string }\nexport function consume(value: Owner) {}",
    "type Alias = object\nexport function consume<Alias>(value: Alias) {}",
  ],
})
