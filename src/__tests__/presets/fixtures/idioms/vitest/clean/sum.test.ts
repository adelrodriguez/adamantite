import { describe, expect, it } from "vitest"

function sum(left: number, right: number) {
  return left + right
}

describe("sum", () => {
  it("adds two values", () => {
    expect(sum(1, 2)).toBe(3)
  })

  it.each([
    [1, 2, 3],
    [2, 3, 5],
  ])("adds %i and %i to %i", (left, right, total) => {
    expect(sum(left, right)).toBe(total)
  })
})
