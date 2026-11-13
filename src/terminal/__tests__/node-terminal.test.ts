import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as NodeTerminal from "#terminal/node-terminal.ts"

// Replaces one property for the scope, and restores its descriptor when the scope closes.
const stubProperty = <T extends object, K extends keyof T>(target: T, key: K, value: T[K]) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const original = Object.getOwnPropertyDescriptor(target, key)

      Object.defineProperty(target, key, { configurable: true, value, writable: true })

      return original
    }),
    (original) =>
      Effect.sync(() => {
        if (original === undefined) {
          Reflect.deleteProperty(target, key)
        } else {
          Object.defineProperty(target, key, original)
        }
      })
  )

// Makes standard input look like a terminal that records each raw mode change, and hides the
// prompt's output.
const fakeTerminalStreams = Effect.gen(function* () {
  const rawModes: boolean[] = []

  yield* stubProperty(process.stdin, "isTTY", true)
  yield* stubProperty(process.stdin, "setRawMode", (mode: boolean) => {
    rawModes.push(mode)

    return process.stdin
  })
  // SAFETY: the prompt calls `write(text, callback)`, and this stub only completes that call.
  yield* stubProperty(process.stdout, "write", ((_text: string, callback?: () => void) => {
    callback?.()

    return true
  }) as typeof process.stdout.write)

  return { rawModes }
})

describe("NodeTerminal.layer", () => {
  // A coding agent starts right after the resolution menu, so a late release would turn off the
  // raw mode that the agent sets for itself. The terminal outlives the prompt, as in the CLI.
  it.effect("turn raw mode off before the prompt returns", () =>
    Effect.gen(function* () {
      const { rawModes } = yield* fakeTerminalStreams

      const fiber = yield* Prompt.run(
        Prompt.Confirm({ initial: true, message: "Hand off to Claude Code?" })
      ).pipe(Effect.forkChild)

      yield* Effect.yieldNow
      process.stdin.emit("keypress", "\r", {
        ctrl: false,
        meta: false,
        name: "return",
        shift: false,
      })

      const answer = yield* Fiber.join(fiber)

      expect({ answer, rawModes }).toStrictEqual({ answer: true, rawModes: [true, false] })
    }).pipe(
      Effect.scoped,
      Effect.provide([
        NodeTerminal.layer,
        FileSystem.layerNoop({}),
        Path.layer,
        Layer.succeed(Prompt.Theme)(Prompt.makeTheme({ colors: false })),
      ])
    )
  )
})
