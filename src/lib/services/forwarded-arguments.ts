import * as Context from "effect/Context"

export const ForwardedArguments = Context.Reference<readonly string[]>(
  "adamantite/ForwardedArguments",
  {
    defaultValue: () => [],
  }
)
