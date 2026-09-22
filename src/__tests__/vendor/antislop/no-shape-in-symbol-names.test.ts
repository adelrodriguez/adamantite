import antislop from "#presets/lint/vendor/antislop/plugin.mjs"
import { testVendoredRule } from "../rule-tester.ts"

testVendoredRule(antislop, "no-shape-in-symbol-names", {
  invalid: [
    {
      code: "export function shapeOf() {}",
      errors: [
        { column: 16, data: { name: "shapeOf" }, line: 1, messageId: "forbiddenSymbolName" },
      ],
    },
    {
      code: "export type Payload = { shape: string }",
      errors: [{ column: 24, data: { name: "shape" }, line: 1, messageId: "forbiddenSymbolName" }],
    },
    {
      code: "export type PayloadShape = { id: string }",
      errors: [
        { column: 12, data: { name: "PayloadShape" }, line: 1, messageId: "forbiddenSymbolName" },
      ],
    },
    {
      code: "export const shape = 1",
      errors: [{ column: 13, data: { name: "shape" }, line: 1, messageId: "forbiddenSymbolName" }],
    },
  ],
  valid: [
    "import type { ExternalSchema } from './external'\n\ndeclare const schema: ExternalSchema\nexport const field = schema.shape.id",
    "const owner = { id: 1 }\nexport const value = owner.id",
  ],
})
