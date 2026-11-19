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

export type TestKey = "ctrl+c" | "down" | "enter" | "n" | "space" | "up" | "y"

export interface TerminalTestContext {
  readonly copied: () => string[]
  readonly layer: Layer.Layer<Terminal.Terminal>
  readonly output: () => string
}

// OSC 52 sets the system clipboard to base64 text. A BEL character ends the sequence.
const CLIPBOARD_PREFIX = "\u001B]52;c;"

function toUserInput(key: TestKey): Terminal.UserInput {
  return {
    input: Option.some(key),
    key: { ctrl: false, meta: false, name: key, shift: false },
  }
}

export function createTerminalTestContext(keys: readonly TestKey[] = []): TerminalTestContext {
  const frames: string[] = []

  const terminal = Layer.effect(Terminal.Terminal)(
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
    copied: () =>
      frames.flatMap((frame) =>
        frame.startsWith(CLIPBOARD_PREFIX)
          ? [Buffer.from(frame.slice(CLIPBOARD_PREFIX.length, -1), "base64").toString("utf8")]
          : []
      ),
    layer: terminal,
    output: () => stripVTControlCharacters(frames.join("")),
  }
}
