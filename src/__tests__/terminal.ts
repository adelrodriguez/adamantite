// Adapted from Effect's `MockTerminal` test service (MIT License, Copyright (c) 2023-present Effectful
// Technologies Inc.):
// https://github.com/Effect-TS/effect-smol/blob/main/packages/effect/test/cli/services/MockTerminal.ts
import { stripVTControlCharacters } from "node:util"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Terminal from "effect/Terminal"

/**
 * A key that a test sends to a prompt, such as `down`, `space`, or `enter`. `ctrl+c` quits the
 * prompt, as Ctrl-C does in a terminal.
 */
export type TestKey = "ctrl+c" | "down" | "enter" | "space" | "up"

export interface TerminalTestContext {
  readonly layer: Layer.Layer<Terminal.Terminal>
  /**
   * Every frame that the prompts displayed, without ANSI escape codes, joined in display order.
   */
  readonly output: () => string
}

function toUserInput(key: TestKey): Terminal.UserInput {
  return {
    input: Option.some(key),
    key: { ctrl: false, meta: false, name: key, shift: false },
  }
}

/**
 * A terminal that answers prompts with the given keys, in order. After the last key, the next
 * prompt dies, so a test that queues too few keys fails at once instead of waiting forever. A
 * `ctrl+c` key ends the input, so the prompt fails with `QuitError`.
 */
export function createTerminalTestContext(keys: readonly TestKey[] = []): TerminalTestContext {
  const frames: string[] = []

  const layer = Layer.effect(Terminal.Terminal)(
    Effect.gen(function* () {
      const queue = yield* Effect.acquireRelease(
        Queue.make<Terminal.UserInput, Cause.Done>(),
        (input) => Queue.shutdown(input)
      )

      const quitAt = keys.indexOf("ctrl+c")

      yield* Queue.offerAll(
        queue,
        (quitAt === -1 ? keys : keys.slice(0, quitAt)).map((key) => toUserInput(key))
      )
      yield* quitAt === -1
        ? Queue.failCause(queue, Cause.die(new Error("The test sent no key for this prompt.")))
        : Queue.end(queue)

      return Terminal.make({
        columns: Effect.succeed(80),
        display: (text) =>
          Effect.sync(() => {
            frames.push(text)
          }),
        readInput: Effect.succeed(queue),
        readLine: Effect.succeed(""),
        rows: Effect.succeed(24),
        size: Effect.never,
      })
    })
  )

  return {
    layer,
    output: () => stripVTControlCharacters(frames.join("")),
  }
}
