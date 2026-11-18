import { beforeAll, describe, expect, it } from 'vitest'

declare const server: { listen(): Promise<void> }

describe('loader', () => {
  beforeAll(async () => {
    await server.listen()
  }, 60_000)

  it('loads', () => {
    expect(1 + 1).toBe(2)
  })
})
