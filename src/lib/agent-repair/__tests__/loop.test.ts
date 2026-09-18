import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { runRepairLoop } from "#lib/agent-repair/loop.ts"

interface Item {
  readonly id: string
}

describe("runRepairLoop", () => {
  it.effect("retry with fresh items and classify introduced work", () => {
    const files = createFileSystemTestContext()
    const prompts: string[] = []
    let verification = 0
    let payloadPath = ""

    return runRepairLoop({
      attempts: 2,
      items: [{ id: "original" }],
      key: (item: Item) => item.id,
      payloadExtension: "json",
      renderPayload: (items) => JSON.stringify(items),
      runAttempt: ({ attempt, items, payloadPath: nextPath }) =>
        Effect.sync(() => {
          payloadPath = nextPath
          prompts.push(`${attempt}:${items.map((item) => item.id).join(",")}`)
          return attempt === 1 ? { note: "The agent attempt timed out." } : {}
        }),
      verify: Effect.sync(() => {
        verification += 1
        return verification === 1 ? [{ id: "original" }, { id: "new" }] : [{ id: "new" }]
      }),
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(prompts).toEqual(["1:original", "2:original,new"])
          expect(result).toMatchObject({
            attempts: 2,
            cleared: [{ id: "original" }],
            introduced: [{ id: "new" }],
            notes: ["The agent attempt timed out."],
            still: [],
          })
        })
      ),
      Effect.andThen(
        Effect.sync(() => {
          expect(files.exists(payloadPath)).toBe(false)
        })
      ),
      Effect.provide(Layer.mergeAll(files.layer, Path.layer))
    )
  })

  it.effect("clear one of two items that share a key", () => {
    const files = createFileSystemTestContext()

    return runRepairLoop({
      attempts: 1,
      items: [{ id: "same" }, { id: "same" }],
      key: (item: Item) => item.id,
      payloadExtension: "json",
      renderPayload: (items) => JSON.stringify(items),
      runAttempt: () => Effect.succeed({}),
      verify: Effect.succeed([{ id: "same" }]),
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toMatchObject({
            cleared: [{ id: "same" }],
            introduced: [],
            still: [{ id: "same" }],
          })
        })
      ),
      Effect.provide(Layer.mergeAll(files.layer, Path.layer))
    )
  })

  it.effect("verify once after cancellation", () => {
    const files = createFileSystemTestContext()
    let verifications = 0

    return Effect.gen(function* () {
      const fiber = yield* runRepairLoop({
        attempts: 1,
        items: [{ id: "item" }],
        key: (item: Item) => item.id,
        payloadExtension: "json",
        renderPayload: () => "payload",
        runAttempt: () => Effect.never,
        verify: Effect.sync(() => {
          verifications += 1
          return []
        }),
      }).pipe(Effect.forkChild)

      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      expect(verifications).toBe(1)
    }).pipe(Effect.provide(Layer.mergeAll(files.layer, Path.layer)))
  })
})
