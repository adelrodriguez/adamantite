import { describe, expect, it } from "vitest"
import { childNodes } from "#presets/lint/plugin/shared/ast.ts"

interface ExpressionStatementFields {
  readonly expression: { readonly name: string; readonly type: "Identifier" }
  readonly type: "ExpressionStatement"
}

// A node as a later Oxlint version could build it, with its fields as getters on a prototype in
// place of own enumerable fields.
class GetterExpressionStatement {
  readonly #fields: ExpressionStatementFields

  constructor(fields: ExpressionStatementFields) {
    this.#fields = fields
  }

  get expression() {
    return this.#fields.expression
  }

  get type() {
    return this.#fields.type
  }
}

describe("childNodes", () => {
  it("throws when the fields of a node are not own enumerable properties", () => {
    const node = new GetterExpressionStatement({
      expression: { name: "value", type: "Identifier" },
      type: "ExpressionStatement",
    })

    expect(() => childNodes(node, { ExpressionStatement: ["expression"] })).toThrow(
      "Child node invariant: AST node fields are not own enumerable properties"
    )
  })
})
