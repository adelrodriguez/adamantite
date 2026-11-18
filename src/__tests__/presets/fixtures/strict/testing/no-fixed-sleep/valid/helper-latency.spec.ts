import { setTimeout as wait } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'

async function slowAnswer() {
  await wait(10)

  return 1
}

describe('client', () => {
  it('reads the answer', async () => {
    expect.assertions(1)

    await expect(slowAnswer()).resolves.toBe(1)
  })
})
