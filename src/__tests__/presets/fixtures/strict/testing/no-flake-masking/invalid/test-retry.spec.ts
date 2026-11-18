import { describe, expect, it } from 'vitest'

describe('loader', () => {
  it('loads', { retry: 2 }, () => {
    expect(1 + 1).toBe(2)
  })
})
