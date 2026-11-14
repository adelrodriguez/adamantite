import { Config, Effect } from "effect"

export const settings = Effect.gen(function* () {
  const inMemory = yield* Config.Boolean("MESSAGE_STORE_IN_MEMORY").pipe(Config.withDefault(false))
  const url = yield* Config.URL("MESSAGE_STORE_URL")

  return { inMemory, url }
})
