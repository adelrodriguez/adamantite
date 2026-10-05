import { describe, expect, it, vi } from "vitest"

describe("callback", () => {
  it("runs once", () => {
    expect.assertions(1)

    const callback = vi.fn<() => void>()

    callback()

    expect(callback).toHaveBeenCalledOnce()
  })
})
