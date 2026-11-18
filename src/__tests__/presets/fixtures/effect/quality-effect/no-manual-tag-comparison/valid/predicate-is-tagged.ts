import * as Predicate from "effect/Predicate"

type Figure = { readonly _tag: "Circle" } | { readonly _tag: "Square" }

export function isCircle(figure: Figure) {
  return Predicate.isTagged(figure, "Circle")
}
