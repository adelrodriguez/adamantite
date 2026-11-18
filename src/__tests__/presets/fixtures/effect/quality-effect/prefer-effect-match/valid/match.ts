import * as Match from "effect/Match"

export const label = Match.type<"a" | "b" | "c">().pipe(
  Match.when("a", () => "first"),
  Match.when("b", () => "second"),
  Match.orElse(() => "other")
)
