import * as Predicate from "effect/Predicate"

type Shape = { readonly _tag: "Circle" } | { readonly _tag: "Square" }

export function isCircle(shape: Shape) {
  return Predicate.isTagged(shape, "Circle")
}
