import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

declare const log: (text: string) => void

export const logged = Effect.succeed("a").pipe(
  Effect.map((text) => {
    log(text)
  })
)

export const loggedOption = Option.some("a").pipe(
  Option.map((text) => {
    log(text)
  })
)
