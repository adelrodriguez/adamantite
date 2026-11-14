import * as Match from "effect/Match"

type State = { readonly _tag: "Ready" } | { readonly _tag: "Pending" }

export const describe = Match.type<State>().pipe(
  Match.when({ _tag: "Ready" }, () => "ready"),
  Match.orElse(() => "pending")
)
