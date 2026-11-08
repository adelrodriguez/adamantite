import * as Option from "effect/Option"

export function isEmpty(value: Option.Option<string>) {
  return Option.isNone(value)
}
