import * as Flag from "effect/cli/Flag"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export type Mode =
  | { readonly _tag: "Json" }
  | { readonly _tag: "Menu" }
  | { readonly _tag: "Plain" }

export const { $is: is, $match: match, Json, Menu, Plain } = Data.taggedEnum<Mode>()

export const CurrentMode = Context.Reference<Mode>("adamantite/Mode", {
  defaultValue: () => Plain(),
})

export const json = Flag.Boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    "Print the result as one JSON document on standard output, and never prompt or start an agent"
  )
)

interface ModeOptions {
  readonly interactive?: boolean
  readonly json: boolean
}

export const provide =
  ({ interactive = true, json: isJson }: ModeOptions) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.flatMap(TerminalCapabilities.TerminalCapabilities, ({ canPrompt }) =>
      Effect.provideService(
        effect,
        CurrentMode,
        isJson ? Json() : canPrompt && interactive ? Menu() : Plain()
      )
    )
