import { describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { TestConsole } from "effect/testing"
import { CommandFailed, PackageNotInstalled, SetupOutdated } from "#lib/shared/errors.ts"
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

  describe("failures", () => {
    const outdated = new SetupOutdated({
      installed: "0.47.0",
      path: ".adamantite/adamantite-lock.json",
      recorded: "0.46.0",
    })

    it.effect("print each failure but a failed command, and exit with the first one's code", () =>
      Effect.gen(function* () {
        const code = yield* Output.failures(
          Cause.combine(
            Cause.fail(
              new CommandFailed({ command: "oxlint", exitCode: ChildProcessSpawner.ExitCode(2) })
            ),
            Cause.fail(outdated)
          )
        )

        expect({ code, errors: yield* TestConsole.errorLines }).toStrictEqual({
          code: ChildProcessSpawner.ExitCode(2),
          errors: [`✖ ${outdated.message}`],
        })
      }).pipe(provideCapabilities(false))
    )

    it.effect(
      "print every failure in order, and exit 1 after an error that is not a command's",
      () =>
        Effect.gen(function* () {
          const notInstalled = new PackageNotInstalled({
            packageName: "oxlint",
            project: "/project",
          })

          const code = yield* Output.failures(
            Cause.combine(Cause.fail(notInstalled), Cause.fail(outdated))
          )

          expect({ code, errors: yield* TestConsole.errorLines }).toStrictEqual({
            code: ChildProcessSpawner.ExitCode(1),
            errors: [`✖ ${notInstalled.message}`, `✖ ${outdated.message}`],
          })
        }).pipe(provideCapabilities(false))
    )
  })
})
