import * as Array from "effect/Array"

export function firstEven(numbers: readonly number[]) {
  return Array.filter(numbers, (value) => value % 2 === 0)[0]
}
