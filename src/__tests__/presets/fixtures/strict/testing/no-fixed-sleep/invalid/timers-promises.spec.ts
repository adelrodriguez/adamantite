import { setTimeout as wait } from 'node:timers/promises'
import { beforeEach } from 'vitest'

beforeEach(async () => {
  await wait(100)
})
