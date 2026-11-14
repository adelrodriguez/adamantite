import { Match } from "effect"

export const label = Match.type<{ readonly _tag: "Ready" } | { readonly _tag: "Waiting" }>().pipe(
  Match.tag("Ready", () => "ready"),
  Match.tag("Waiting", () => "waiting"),
  Match.exhaustive
)
