import { describe, expect, it } from "vitest"

describe("sum", () => {
  it("adds two numbers", () => {
    expect.assertions(1)
    expect(1 + 1).toBe(2)
  })
})
