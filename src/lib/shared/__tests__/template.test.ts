import { describe, expect, it } from "@effect/vitest"
import { fillTemplate } from "#lib/shared/template.ts"

describe("fillTemplate", () => {
  it("replace each slot with its value", () => {
    expect(fillTemplate("{{name}} uses {{version}}.", { name: "Acme", version: "1.2.3" })).toBe(
      "Acme uses 1.2.3."
    )
  })

  it("keep placeholder-like text inside a value literal", () => {
    expect(fillTemplate("{{a}} {{b}}", { a: "{{b}} $&", b: "x" })).toBe("{{b}} $& x")
  })

  it("keep a slot without a value as written", () => {
    expect(fillTemplate("{{missing}} {{constructor}}", {})).toBe("{{missing}} {{constructor}}")
  })
})
