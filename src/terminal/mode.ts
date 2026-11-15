import * as Flag from "effect/cli/Flag"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

/**
 * How a command presents its result. `Json` prints one JSON document on standard output and every
 * other line on standard error, and never asks. `Menu` asks the user in a terminal. `Plain` prints
 * the lines and the Markdown prompt, and never asks.
 */
export type Mode =
  | { readonly _tag: "Json" }
  | { readonly _tag: "Menu" }
  | { readonly _tag: "Plain" }

export const { $is: is, $match: match, Json, Menu, Plain } = Data.taggedEnum<Mode>()

/**
 * The mode of the running command. A command that does not decide one prints as `Plain`.
 */
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
  /**
   * False when the user turned the prompts off, such as with `init --non-interactive`.
   */
  readonly interactive?: boolean
  readonly json: boolean
}

/**
 * Runs `effect` in the mode that the command decides once: `Json` with `--json`, `Menu` when the
 * terminal can prompt and the user allows it, and `Plain` otherwise.
 */
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
