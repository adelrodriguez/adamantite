import { beforeEach, describe, expect, it, jest } from "@jest/globals"

describe("callback", () => {
  const callback = jest.fn<(value: number) => void>()
  beforeEach(() => {
    callback.mockReset()
  })

  it("records each call", () => {
    callback(1)
    expect(callback).toHaveBeenCalledWith(1)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
