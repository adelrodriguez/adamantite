import type * as Option from "effect/Option"

export function isEmpty(value: Option.Option<string>) {
  return value._tag === "None"
}
