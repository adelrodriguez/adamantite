import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { TestClock } from "effect/testing"
import { TerminalInput } from "#terminal/input.ts"
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

// Answers one confirm prompt through the CLI's terminal with a return key.
const confirm = Effect.gen(function* () {
  const fiber = yield* Prompt.run(
    Prompt.Confirm({ initial: true, message: "Hand off to Claude Code?" })
  ).pipe(Effect.forkChild)

  yield* Effect.yieldNow
  process.stdin.emit("keypress", "\r", { ctrl: false, meta: false, name: "return", shift: false })

  return yield* Fiber.join(fiber)
})

// The terminal outlives each prompt, as in the CLI. The test clock stays paused, so Effect's 10 ms
// release between prompts never runs on its own.
const provideTerminal = Effect.provide([
  NodeTerminal.layer,
  FileSystem.layerNoop({}),
  Path.layer,
  Layer.succeed(Prompt.Theme)(Prompt.makeTheme({ colors: false })),
])

describe("NodeTerminal.layer", () => {
  // Effect keeps raw mode between adjacent prompts, because a quick toggle can hang a Windows TTY.
  it.effect("keep raw mode on between adjacent prompts", () =>
    Effect.gen(function* () {
      const { rawModes } = yield* fakeTerminalStreams
      const answers = [yield* confirm, yield* confirm]

      expect({ answers, rawModes }).toStrictEqual({ answers: [true, true], rawModes: [true] })
    }).pipe(Effect.scoped, provideTerminal)
  )

  // A command can start another process after its last prompt, such as a package install, so the
  // reader must not hold raw mode once Effect's 10 ms between prompts has passed.
  it.effect("turn raw mode off 10 ms after the last prompt", () =>
    Effect.gen(function* () {
      const { rawModes } = yield* fakeTerminalStreams

      yield* confirm
      yield* TestClock.adjust("10 millis")

      expect(rawModes).toStrictEqual([true, false])
    }).pipe(Effect.scoped, provideTerminal)
  )

  // A coding agent sets its own terminal mode, so the release must happen before it starts.
  it.effect("turn raw mode off at once when the input is released", () =>
    Effect.gen(function* () {
      const { rawModes } = yield* fakeTerminalStreams
      const input = yield* TerminalInput

      yield* confirm
      yield* input.release

      expect(rawModes).toStrictEqual([true, false])
    }).pipe(Effect.scoped, provideTerminal)
  )
})
