import { describe, expect, it } from "vitest"

const values: number[] = []

function addValue(value: number): void {
  values.push(value)
}

addValue(1)

describe("values", () => {
  it("have the added value", () => {
    expect(values).toStrictEqual([1])
  })
})
