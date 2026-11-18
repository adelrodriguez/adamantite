import { describe, expect, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'

describe('loader', () => {
  it.live('loads', () =>
    Effect.gen(function* () {
      yield* Effect.sleep('100 millis')
      expect(1 + 1).toBe(2)
    })
  )
})
