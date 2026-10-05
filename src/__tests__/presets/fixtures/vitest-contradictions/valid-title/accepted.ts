import { describe, expect, it } from "vitest"
import { parseDescriptor } from "./parse-descriptor"

describe("parseDescriptor", () => {
  it("reads the name", () => {
    expect.assertions(1)
    expect(parseDescriptor("name")).toBe("name")
  })
})
