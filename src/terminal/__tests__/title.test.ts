import { describe, expect, it } from "@effect/vitest"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Terminal from "effect/Terminal"
import * as Mode from "#terminal/mode.ts"
import { printTitle } from "#terminal/title.ts"

function noop() {
  return null
}

function makeTerminalLayer(columns?: number) {
  return Layer.succeed(Terminal.Terminal)(
    Terminal.make({
      // SAFETY: Node reports undefined columns when stdout is not a TTY despite the Terminal interface promising a number, and printTitle guards the missing width with a falsy check.
      columns: Effect.succeed<number | undefined>(columns) as Effect.Effect<number>,
      display: () => Effect.void,
      readInput: Effect.never,
      readLine: Effect.never,
      rows: Effect.succeed(24),
      size: Effect.never,
    })
  )
}

function makeConsoleContext() {
  const capturedLogs: string[] = []

  const mockConsole: Console.Console = {
    assert: noop,
    clear: noop,
    count: noop,
    countReset: noop,
    debug: noop,
    dir: noop,
    dirxml: noop,
    error: noop,
    group: noop,
    groupCollapsed: noop,
    groupEnd: noop,
    info: (...args: unknown[]) => {
      const message = args.map(String).join(" ")
      capturedLogs.push(message)

      return null
    },
    log: noop,
    table: noop,
    time: noop,
    timeEnd: noop,
    timeLog: noop,
    trace: noop,
    warn: noop,
  }

  return { capturedLogs, layer: Layer.succeed(Console.Console)(mockConsole) }
}

describe("printTitle", () => {
  it.effect("print the title when the terminal is wide enough", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle.pipe(
        Effect.provideService(Mode.CurrentMode, Mode.Menu()),
        Effect.provide(Layer.merge(makeTerminalLayer(120), console.layer))
      )

      expect(console.capturedLogs).toHaveLength(1)
      expect(console.capturedLogs[0]).toContain(".ooooo.")
    })
  )

  it.effect("not print the title when the terminal is too narrow", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle.pipe(
        Effect.provideService(Mode.CurrentMode, Mode.Menu()),
        Effect.provide(Layer.merge(makeTerminalLayer(50), console.layer))
      )

      expect(console.capturedLogs).toHaveLength(0)
    })
  )

  it.effect("not print the title when process.stdout.columns is undefined", () =>
    Effect.gen(function* () {
      const console = makeConsoleContext()

      yield* printTitle.pipe(
        Effect.provideService(Mode.CurrentMode, Mode.Menu()),
        Effect.provide(Layer.merge(makeTerminalLayer(), console.layer))
      )

      expect(console.capturedLogs).toHaveLength(0)
    })
  )
})
