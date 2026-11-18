import { describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Runtime from "effect/Runtime"
import { TestConsole } from "effect/testing"
import { createRunnerTestContext, type RunnerTestContext } from "#__tests__/command-test-helpers.ts"
import { makeAppLayer, reportFailure, runCli } from "#cli.ts"
import { CommandFailed, SetupOutdated } from "#lib/shared/errors.ts"
import * as Mode from "#terminal/mode.ts"

function runCliWithRunner(args: readonly string[], runner: RunnerTestContext) {
  return runCli(args, "test").pipe(Effect.provide(makeAppLayer(runner.layer)), Effect.exit)
}

const OUTDATED = new SetupOutdated({
  installed: "0.47.0",
  path: ".adamantite/adamantite-lock.json",
  recorded: "0.46.0",
})

const DEFECT = new Error("version verification defect")

/**
 * Reports `cause` as the CLI boundary does, and returns the lines on standard error, the exit of
 * the report, and the exit code that `src/index.ts` sets for that exit: the returned code, or the
 * runtime's code for a cause that the report leaves.
 */
function report(cause: Cause.Cause<CommandFailed | SetupOutdated>) {
  return Effect.gen(function* () {
    const exit = yield* reportFailure(cause).pipe(Effect.exit)
    const codes: number[] = []

    if (Exit.isSuccess(exit)) {
      codes.push(exit.value)
    } else {
      Runtime.defaultTeardown(exit, (code) => {
        codes.push(code)
      })
    }

    return { code: codes[0], errors: yield* TestConsole.errorLines, exit }
  }).pipe(
    Effect.provide([
      TestConsole.layer,
      Layer.succeed(TerminalCapabilities.TerminalCapabilities)({
        canAnimate: false,
        canColor: false,
        canPrompt: false,
      }),
      Layer.succeed(Mode.CurrentMode, Mode.Plain()),
    ])
  )
}

describe("adamantite", () => {
  describe("reportFailure", () => {
    it.effect("print each typed error, and exit with the first one's code", () =>
      Effect.gen(function* () {
        const { code, errors } = yield* report(
          Cause.combine(
            Cause.fail(
              new CommandFailed({ command: "oxfmt", exitCode: ChildProcessSpawner.ExitCode(2) })
            ),
            Cause.fail(OUTDATED)
          )
        )

        expect({ code, errors }).toStrictEqual({ code: 2, errors: [`✖ ${OUTDATED.message}`] })
      })
    )

    // The runtime prints the defect with its stack, and a defect exits 1.
    it.effect.each([
      {
        cause: Cause.combine(Cause.fail(OUTDATED), Cause.die(DEFECT)),
        errors: [`✖ ${OUTDATED.message}`],
        name: "a typed error",
      },
      {
        cause: Cause.combine(
          Cause.fail(
            new CommandFailed({ command: "oxfmt", exitCode: ChildProcessSpawner.ExitCode(2) })
          ),
          Cause.die(DEFECT)
        ),
        errors: [],
        name: "a failed command",
      },
    ])("print $name, and leave the defect beside it to the runtime", ({ cause, errors }) =>
      Effect.gen(function* () {
        const result = yield* report(cause)

        expect({
          code: result.code,
          errors: result.errors,
          left: Exit.isFailure(result.exit) ? result.exit.cause : undefined,
        }).toStrictEqual({ code: 1, errors, left: Cause.die(DEFECT) })
      })
    )

    // The runtime reports no interruption, and an interruption exits 130.
    it.effect("print a typed error, and leave the interruption beside it to the runtime", () =>
      Effect.gen(function* () {
        const result = yield* report(Cause.combine(Cause.fail(OUTDATED), Cause.interrupt(1)))

        expect({
          code: result.code,
          errors: result.errors,
          left: Exit.isFailure(result.exit) ? result.exit.cause : undefined,
        }).toStrictEqual({
          code: 130,
          errors: [`✖ ${OUTDATED.message}`],
          left: Cause.interrupt(1),
        })
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("forward every argument after the first separator to the selected command", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCliWithRunner(
          ["analyze", "--strict", "--", "--directory", "packages/app", "--", "--include", "src"],
          runner
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations.map(({ args, command }) => ({ args, command }))).toStrictEqual([
          {
            args: [
              "--production",
              "--strict",
              "--directory",
              "packages/app",
              "--",
              "--include",
              "src",
            ],
            command: "knip",
          },
        ])
      })
    )

    it.effect("reject passthrough arguments for commands that do not proxy a CLI", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCliWithRunner(["doctor", "--", "--unknown"], runner)

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error._tag).toBe("PassthroughNotSupported")
        expect(runner.invocations).toStrictEqual([])
      })
    )
  })
})
