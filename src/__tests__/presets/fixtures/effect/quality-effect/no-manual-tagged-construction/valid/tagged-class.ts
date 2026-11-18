import * as Data from "effect/Data"

class Ready extends Data.TaggedClass("Ready")<{ readonly value: number }> {}

export const ready = new Ready({ value: 1 })
