import * as Array from "effect/Array"

export function hasLarge(numbers: readonly number[]) {
  return Array.filter(numbers, (value) => value > 1).length > 0
}
