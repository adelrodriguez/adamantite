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
      key: (item: Item) => item.id,
      payloadExtension: "json",
      renderPayload: (items) => JSON.stringify(items),
      renderPrompt: ({ attempt, items, payloadPath: nextPath }) => {
        payloadPath = nextPath
        return `${attempt}:${items.map((item) => item.id).join(",")}`
      },
      runAttempt: ({ prompt }) =>
        Effect.sync(() => {
          prompts.push(prompt)
          return prompt.startsWith("1:")
            ? { kind: "timed-out" as const }
            : { kind: "completed" as const }
        }),
      verify: () =>
        Effect.sync(() => {
          verification += 1
          return verification === 1 ? [{ id: "original" }, { id: "new" }] : [{ id: "new" }]
        }),
      workUnits: [{ items: [{ id: "original" }], unit: "project" }],
    }).pipe(
      Effect.tap((results) =>
        Effect.sync(() => {
          expect(prompts).toEqual(["1:original", "2:original,new"])
          expect(results[0]).toMatchObject({
            attempts: 2,
            cleared: [{ id: "original" }],
            introduced: [{ id: "new" }],
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

  it.effect("verify once after cancellation", () => {
    const files = createFileSystemTestContext()
    let verifications = 0

    return Effect.gen(function* () {
      const fiber = yield* runRepairLoop({
        attempts: 1,
        key: (item: Item) => item.id,
        payloadExtension: "txt",
        renderPayload: () => "payload",
        renderPrompt: () => "prompt",
        runAttempt: () => Effect.never,
        verify: () =>
          Effect.sync(() => {
            verifications += 1
            return []
          }),
        workUnits: [{ items: [{ id: "item" }], unit: "project" }],
      }).pipe(Effect.forkChild)

      yield* Effect.yieldNow
      yield* Fiber.interrupt(fiber)
      expect(verifications).toBe(1)
    }).pipe(Effect.provide(Layer.mergeAll(files.layer, Path.layer)))
  })
})
