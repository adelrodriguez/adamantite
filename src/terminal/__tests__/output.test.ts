import { describe, expect, it } from "@effect/vitest"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { TestConsole } from "effect/testing"
import * as Output from "#terminal/output.ts"

function provideCapabilities(canColor: boolean) {
  return Effect.provide(
    Layer.mergeAll(
      TestConsole.layer,
      Layer.succeed(TerminalCapabilities.TerminalCapabilities)({
        canAnimate: false,
        canColor,
        canPrompt: false,
      })
    )
  )
}

describe("Output", () => {
  it.effect("mark each status line with its symbol", () =>
    Effect.gen(function* () {
      yield* Output.info("Detected package manager: pnpm")
      yield* Output.success("Dependencies installed.")
      yield* Output.warning("Kept the existing `check` script.")
      yield* Output.error("VS Code's `code` command was not found on PATH.")
      yield* Output.cancel("Setup was cancelled.")

      expect(yield* TestConsole.logLines).toStrictEqual([
        "● Detected package manager: pnpm",
        "✔ Dependencies installed.",
        "▲ Kept the existing `check` script.",
        "✖ VS Code's `code` command was not found on PATH.",
        "\n■ Setup was cancelled.",
      ])
    }).pipe(provideCapabilities(false))
  )

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

  it.effect("indent the body of a note under its title, after a blank line", () =>
    Effect.gen(function* () {
      yield* Output.intro("💠 adamantite doctor")
      yield* Output.note(
        "1. Missing script",
        "Current state\nNo `check` script.\n\nGoal\n• Add it."
      )
      yield* Output.outro("✅ Doctor finished.")

      expect(yield* TestConsole.logLines).toStrictEqual([
        "💠 adamantite doctor",
        "\n1. Missing script\n  Current state\n  No `check` script.\n\n  Goal\n  • Add it.",
        "✅ Doctor finished.",
      ])
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
