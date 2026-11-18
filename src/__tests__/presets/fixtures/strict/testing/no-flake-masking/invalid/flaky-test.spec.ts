import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

describe('loader', () => {
  it.effect('loads', () =>
    it.flakyTest(Effect.sync(() => expect(1 + 1).toBe(2)))
  )
})
