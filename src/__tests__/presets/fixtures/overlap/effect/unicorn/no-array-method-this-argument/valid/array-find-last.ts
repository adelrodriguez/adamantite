import * as Array from "effect/Array"

export function last(values: readonly string[]) {
  return Array.findLast(values, (value) => value.length > 0)
}
