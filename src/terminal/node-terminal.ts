import * as NodeTerminal from "@effect/platform-node/NodeTerminal"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Terminal from "effect/Terminal"

/**
 * Node's terminal, with a new key reader for each prompt. Node's terminal turns raw mode off 10 ms
 * after a prompt ends, so a coding agent that starts in that time loses its raw mode to the late
 * release. A reader made in the prompt's own scope turns raw mode off when the prompt ends.
 */
export const layer = Layer.effect(Terminal.Terminal)(
  Effect.map(NodeTerminal.make(), (terminal) =>
    Terminal.make({
      ...terminal,
      readInput: Effect.flatMap(NodeTerminal.make(), (reader) => reader.readInput),
    })
  )
)
