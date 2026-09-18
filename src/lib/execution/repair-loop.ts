import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

export interface RepairAttemptContext<Unit, Item> {
  readonly attempt: number
  readonly items: readonly Item[]
  readonly payloadPath: string
  readonly unit: Unit
}

export type RepairAttemptOutcome =
  | { readonly kind: "completed"; readonly note?: string }
  | { readonly kind: "failed"; readonly note: string }
  | { readonly kind: "timed-out"; readonly note?: string }

export type RepairItemKey = string | number | symbol

export interface RepairWorkUnit<Unit, Item> {
  readonly items: readonly Item[]
  readonly unit: Unit
}

export interface RepairUnitResult<Unit, Item> {
  readonly attempts: number
  readonly cleared: readonly Item[]
  readonly introduced: readonly Item[]
  readonly notes: readonly string[]
  readonly still: readonly Item[]
  readonly unit: Unit
}

export interface RepairLoopOptions<
  Unit,
  Item,
  E,
  RunRequirements,
  VerifyRequirements,
  InterruptRequirements = never,
> {
  readonly attempts: number
  readonly concurrency?: number
  readonly key: (item: Item) => RepairItemKey
  readonly onInterrupt?: (
    unit: Unit,
    remaining: readonly Item[]
  ) => Effect.Effect<void, never, InterruptRequirements>
  readonly payloadExtension: "json" | "md" | "txt"
  readonly renderPayload: (items: readonly Item[]) => string
  readonly renderPrompt: (context: RepairAttemptContext<Unit, Item>) => string
  readonly runAttempt: (
    context: RepairAttemptContext<Unit, Item> & { readonly prompt: string }
  ) => Effect.Effect<RepairAttemptOutcome, never, RunRequirements>
  readonly verify: (unit: Unit) => Effect.Effect<readonly Item[], E, VerifyRequirements>
  readonly workUnits: ReadonlyArray<RepairWorkUnit<Unit, Item>>
}

function classify<Item>(
  original: readonly Item[],
  remaining: readonly Item[],
  key: (item: Item) => RepairItemKey
) {
  const originalKeys = new Set(original.map((item) => key(item)))
  const remainingKeys = new Set(remaining.map((item) => key(item)))

  return {
    cleared: original.filter((item) => !remainingKeys.has(key(item))),
    introduced: remaining.filter((item) => !originalKeys.has(key(item))),
    still: remaining.filter((item) => originalKeys.has(key(item))),
  }
}

export const runRepairLoop = Effect.fn("runRepairLoop")(function* <
  Unit,
  Item,
  E,
  RunRequirements,
  VerifyRequirements,
  InterruptRequirements = never,
>(
  options: RepairLoopOptions<
    Unit,
    Item,
    E,
    RunRequirements,
    VerifyRequirements,
    InterruptRequirements
  >
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const tempDirectory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "adamantite-" })

      return yield* Effect.forEach(
        options.workUnits,
        (workUnit, index) =>
          Effect.gen(function* () {
            const payloadPath = path.join(
              tempDirectory,
              `repair-${index + 1}.${options.payloadExtension}`
            )
            let remaining = workUnit.items
            let attempts = 0
            const notes: string[] = []

            while (remaining.length > 0 && attempts < options.attempts) {
              attempts += 1
              yield* fileSystem.writeFileString(payloadPath, options.renderPayload(remaining))
              const context = {
                attempt: attempts,
                items: remaining,
                payloadPath,
                unit: workUnit.unit,
              }
              const prompt = options.renderPrompt(context)
              const outcome = yield* options.runAttempt({ ...context, prompt }).pipe(
                Effect.onInterrupt(() =>
                  options.verify(workUnit.unit).pipe(
                    Effect.flatMap(
                      (items) => options.onInterrupt?.(workUnit.unit, items) ?? Effect.void
                    ),
                    Effect.ignore
                  )
                )
              )

              if (outcome.note !== undefined) {
                notes.push(outcome.note)
              }

              remaining = yield* options.verify(workUnit.unit)
            }

            return {
              ...classify(workUnit.items, remaining, options.key),
              attempts,
              notes,
              unit: workUnit.unit,
            } satisfies RepairUnitResult<Unit, Item>
          }),
        { concurrency: options.concurrency ?? 1 }
      )
    })
  )
})
