import { describe, expect, test } from "vitest"

function sum(left: number, right: number) {
  return left + right
}

describe("sum", () => {
  test.each([
    [1, 2, 3],
    [2, 2, 4],
  ])("adds %i and %i to %i", (left, right, total) => {
    expect(sum(left, right)).toBe(total)
  })
})
