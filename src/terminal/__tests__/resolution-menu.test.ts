import process from "node:process"
import * as NodeTerminal from "@effect/platform-node/NodeTerminal"
import { describe, expect, it } from "@effect/vitest"
import * as Prompt from "effect/cli/Prompt"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import { TestClock, TestConsole } from "effect/testing"
import { CodingAgents, codingAgents } from "#lib/handoff/coding-agents.ts"
import * as Project from "#lib/project/index.ts"
import { chooseResolution } from "#terminal/resolution-menu.ts"

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

// Yields until the prompt listens for keys, so the test key reaches the prompt.
const waitForKeyReader = Effect.yieldNow.pipe(
  Effect.repeat({ until: () => process.stdin.listenerCount("keypress") > 0 })
)

const [agent] = codingAgents

describe("chooseResolution", () => {
  // Effect's Node terminal turns raw mode off 10 ms after the last prompt. A coding agent sets its
  // own terminal mode, so that release must run before the agent starts.
  it.effect("start the agent after Effect turns raw mode off", () =>
    Effect.gen(function* () {
      const { rawModes } = yield* fakeTerminalStreams
      const rawModesAtStart: boolean[][] = []

      const agents = Layer.succeed(CodingAgents)({
        detectInstalled: () => Effect.succeed([agent]),
        handoff: () =>
          Effect.sync(() => {
            rawModesAtStart.push([...rawModes])
          }),
      })

      const fiber = yield* chooseResolution({
        command: "Doctor",
        message: "How do you want to resolve the findings?",
        prompt: "Fix the findings.",
        subject: "findings",
      }).pipe(
        Effect.provide(agents),
        Effect.provideService(Project.Directory, "/project"),
        Effect.forkChild
      )

      yield* waitForKeyReader
      process.stdin.emit("keypress", "\r", {
        ctrl: false,
        meta: false,
        name: "return",
        shift: false,
      })
      // The test clock is paused, so both Effect's release and the menu's wait run in time order.
      yield* TestClock.adjust("1 second")

      const result = yield* Fiber.join(fiber)

      expect({ rawModesAtStart, result: result._tag }).toStrictEqual({
        rawModesAtStart: [[true, false]],
        result: "Ended",
      })
    }).pipe(
      Effect.scoped,
      Effect.provide([
        NodeTerminal.layer,
        FileSystem.layerNoop({}),
        Path.layer,
        TestConsole.layer,
        Layer.succeed(Prompt.Theme)(Prompt.makeTheme({ colors: false })),
      ])
    )
  )
})
