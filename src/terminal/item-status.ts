import * as Effect from "effect/Effect"
import { Prompter } from "#terminal/prompter.ts"

export interface ItemStatus {
  readonly label: string
  readonly status: "done" | "failed" | "pending"
}

export const printItemStatuses = Effect.fn("printItemStatuses")(function* (
  items: readonly ItemStatus[]
) {
  const prompter = yield* Prompter

  for (const item of items) {
    const marker = item.status === "done" ? "✓" : item.status === "failed" ? "✗" : "○"
    yield* prompter.message(`${marker} ${item.label}`)
  }
})
