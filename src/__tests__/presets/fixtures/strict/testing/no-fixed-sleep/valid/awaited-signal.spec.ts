import { describe, expect, it } from 'vitest'

declare const server: { ready: Promise<number> }

describe('server', () => {
  it('starts', async () => {
    expect.assertions(1)

    await expect(server.ready).resolves.toBe(1)
  })
})
