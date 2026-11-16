import { describe, expect, it } from "@effect/vitest"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { TestConsole } from "effect/testing"
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"

function provideCapabilities(canColor: boolean, mode: Mode.Mode = Mode.Menu()) {
  return Effect.provide(
    Layer.mergeAll(
      TestConsole.layer,
      Layer.succeed(TerminalCapabilities.TerminalCapabilities)({
        canAnimate: false,
        canColor,
        canPrompt: false,
      }),
      Layer.succeed(Mode.CurrentMode, mode)
    )
  )
}

describe("Output", () => {
  it.effect("indent the continuation lines of a status under its text", () =>
    Effect.gen(function* () {
      yield* Output.warning("First line\n\nThird line")

      expect(yield* TestConsole.logLines).toStrictEqual(["▲ First line\n\n  Third line"])
    }).pipe(provideCapabilities(false))
  )

  it.effect("write the failure of a command to standard error", () =>
    Effect.gen(function* () {
      yield* Output.failure("No package manager was found.")

      expect({
        errors: yield* TestConsole.errorLines,
        logs: yield* TestConsole.logLines,
      }).toStrictEqual({ errors: ["✖ No package manager was found."], logs: [] })
    }).pipe(provideCapabilities(false))
  )

  it.effect("color the symbols and headings when the terminal shows color", () =>
    Effect.gen(function* () {
      yield* Output.success("Dependencies installed.")
      yield* Output.intro("💠 adamantite init")

      expect(yield* TestConsole.logLines).toStrictEqual([
        "\u001B[32m✔\u001B[39m Dependencies installed.",
        "\u001B[1m💠 adamantite init\u001B[22m",
      ])
    }).pipe(provideCapabilities(true))
  )
})
