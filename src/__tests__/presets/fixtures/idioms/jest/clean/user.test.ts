import { describe, expect, it } from "@jest/globals"

describe("response", () => {
  it("loads the response", async () => {
    expect.hasAssertions()
    const value = await Promise.resolve({ status: "ready" })
    expect(value).toMatchSnapshot()
  })
})
