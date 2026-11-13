import * as Option from "effect/Option"

export function wrap(fallback: string) {
  return Option.some(fallback)
}
