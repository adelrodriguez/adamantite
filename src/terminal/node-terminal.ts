import * as NodeTerminal from "@effect/platform-node/NodeTerminal"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as RcRef from "effect/RcRef"
import * as Terminal from "effect/Terminal"
import { TerminalInput } from "#terminal/input.ts"

/**
 * Node's terminal, with a key reader that `TerminalInput.release` can close. The reader keeps
 * Effect's behavior between adjacent prompts: it stays in raw mode for 10 ms, which avoids a
 * Windows TTY hang. Without the release, that delay would turn raw mode off after a coding agent
 * starts.
 */
export const layer = Layer.effectContext(
  Effect.gen(function* () {
    const terminal = yield* NodeTerminal.make()

    const reader = yield* RcRef.make({
      acquire: NodeTerminal.make(),
      idleTimeToLive: Duration.infinity,
    })

    return Context.make(
      Terminal.Terminal,
      Terminal.make({
        ...terminal,
        readInput: Effect.flatMap(RcRef.get(reader), (keys) => keys.readInput),
      })
    ).pipe(Context.add(TerminalInput, { release: RcRef.invalidate(reader) }))
  })
)
