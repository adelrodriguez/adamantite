import * as Effect from "effect/Effect"
import { Prompter } from "#terminal/prompter.ts"

const MARKERS = { done: "✓", failed: "✗", pending: "○" }

export const printItemStatuses = Effect.fn("printItemStatuses")(function* <Item>(
  status: keyof typeof MARKERS,
  items: readonly Item[],
  label: (item: Item) => string
) {
  const prompter = yield* Prompter

  for (const item of items) {
    yield* prompter.message(`${MARKERS[status]} ${label(item)}`)
  }
})
