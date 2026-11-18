import { describe, expect, it } from 'vitest'

describe('loader', () => {
  it('loads', async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 100)
    })
    expect(1 + 1).toBe(2)
  })
})
