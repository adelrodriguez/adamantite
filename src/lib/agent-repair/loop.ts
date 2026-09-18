import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

export interface RepairAttempt<Item> {
  readonly attempt: number
  readonly items: readonly Item[]
  readonly payloadPath: string
}

export interface RepairAttemptOutcome {
  readonly note?: string
}

export interface RepairResult<Item> {
  readonly attempts: number
  readonly cleared: readonly Item[]
  readonly introduced: readonly Item[]
  readonly notes: readonly string[]
  readonly still: readonly Item[]
}

// The requirement parameters stay separate because TypeScript does not infer one parameter as the
// union of the requirements of several callbacks.
export interface RepairLoopOptions<
  Item,
  E,
  RunRequirements,
  VerifyRequirements,
  InterruptRequirements = never,
> {
  readonly attempts: number
  readonly items: readonly Item[]
  readonly key: (item: Item) => string
  readonly onInterrupt?: (
    remaining: readonly Item[]
  ) => Effect.Effect<void, never, InterruptRequirements>
  readonly payloadExtension: "json" | "md"
  readonly renderPayload: (items: readonly Item[]) => string
  readonly runAttempt: (
    attempt: RepairAttempt<Item>
  ) => Effect.Effect<RepairAttemptOutcome, never, RunRequirements>
  readonly verify: Effect.Effect<readonly Item[], E, VerifyRequirements>
}

// Items can share a key, such as two identical diagnostics in one file. Each remaining item
// accounts for one original item with the same key. The rest of the originals are cleared.
function classify<Item>(
  original: readonly Item[],
  remaining: readonly Item[],
  key: (item: Item) => string
) {
  const unmatched = new Map<string, number>()
  for (const item of original) {
    unmatched.set(key(item), (unmatched.get(key(item)) ?? 0) + 1)
  }

  const still: Item[] = []
  const introduced: Item[] = []
  for (const item of remaining) {
    const count = unmatched.get(key(item)) ?? 0
    if (count > 0) {
      unmatched.set(key(item), count - 1)
      still.push(item)
    } else {
      introduced.push(item)
    }
  }

  const cleared: Item[] = []
  for (const item of original) {
    const count = unmatched.get(key(item)) ?? 0
    if (count > 0) {
      unmatched.set(key(item), count - 1)
      cleared.push(item)
    }
  }

  return { cleared, introduced, still }
}

export const runRepairLoop = Effect.fn("runRepairLoop")(function* <
  Item,
  E,
  RunRequirements,
  VerifyRequirements,
  InterruptRequirements = never,
>(options: RepairLoopOptions<Item, E, RunRequirements, VerifyRequirements, InterruptRequirements>) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const tempDirectory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "adamantite-" })
      const payloadPath = path.join(tempDirectory, `repair.${options.payloadExtension}`)
      let remaining = options.items
      let attempts = 0
      const notes: string[] = []

      while (remaining.length > 0 && attempts < options.attempts) {
        attempts += 1
        yield* fileSystem.writeFileString(payloadPath, options.renderPayload(remaining))
        const outcome = yield* options
          .runAttempt({ attempt: attempts, items: remaining, payloadPath })
          .pipe(
            Effect.onInterrupt(() =>
              options.verify.pipe(
                Effect.flatMap((items) => options.onInterrupt?.(items) ?? Effect.void),
                Effect.ignore
              )
            )
          )

        if (outcome.note !== undefined) {
          notes.push(outcome.note)
        }

        remaining = yield* options.verify
      }

      return {
        ...classify(options.items, remaining, options.key),
        attempts,
        notes,
      } satisfies RepairResult<Item>
    })
  )
})
