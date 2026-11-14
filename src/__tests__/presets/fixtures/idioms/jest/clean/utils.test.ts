import { beforeEach, describe, expect, it, jest } from "@jest/globals"

describe("callback", () => {
  const callback = jest.fn<(value: number) => number>()
  beforeEach(() => {
    callback.mockReset()
    callback.mockReturnValue(3)
  })

  it("returns the configured value", () => {
    expect(callback(1)).toBe(3)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
