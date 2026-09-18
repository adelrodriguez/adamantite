import type * as PlatformError from "effect/PlatformError"
import process from "node:process"
import { styleText } from "node:util"
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CliNotFound, CommandFailed } from "#lib/shared/errors.ts"

export interface CommandRunOptions {
  readonly args: string[]
  readonly command: string
  readonly cwd?: string
  /**
   * The platform spawner defaults to a new session on POSIX. Pass `false` to keep the child in this
   * process's group so terminal-generated signals reach it.
   */
  readonly detached?: boolean
  readonly stderr?: "ignore" | "inherit"
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
  /**
   * What the command is doing, such as `"✨ Checking formatting"`. When set, `run` prints it as a
   * heading above the command's inherited output.
   */
  readonly title?: string
}

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

interface CommandRunnerService {
  readonly exitCode: (
    options: CommandRunOptions
  ) => Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike>
  readonly run: (
    options: CommandRunOptions
  ) => Effect.Effect<void, CommandFailed | CommandFailedLike>
  /**
   * Runs every step in order, even after one fails, then fails with the first failure.
   */
  readonly runAll: (
    steps: readonly CommandRunOptions[]
  ) => Effect.Effect<void, CommandFailed | CommandFailedLike>
  /**
   * Runs the steps in order and stops at the first failure.
   */
  readonly runUntilFailure: (
    steps: readonly CommandRunOptions[]
  ) => Effect.Effect<void, CommandFailed | CommandFailedLike>
}

const printHeading = (title: string, command: string) =>
  Console.log(`${styleText("bold", title)} ${styleText("dim", `· adamantite (${command})`)}`)

/**
 * Oxlint and Oxfmt load TypeScript configs through Node, which warns about every typeless
 * `package.json` it reparses as ESM. The warning is noise for users who cannot act on it.
 */
const quietNodeOptions = () =>
  [process.env["NODE_OPTIONS"], "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"]
    .filter(Boolean)
    .join(" ")

const exitCode = Effect.fn("CommandRunner.exitCode")(function* ({
  args,
  command,
  cwd,
  detached,
  stderr = "inherit",
  stdin = "ignore",
  stdout = "inherit",
}: CommandRunOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        cwd,
        detached,
        env: { NODE_OPTIONS: quietNodeOptions() },
        extendEnv: true,
        stderr,
        stdin,
        stdout,
      })

      return yield* handle.exitCode
    })
  ).pipe(
    Effect.mapError((cause) =>
      cause.reason._tag === "NotFound" ? new CliNotFound({ command }) : cause
    )
  )
})

export class CommandRunner extends Context.Service<CommandRunner, CommandRunnerService>()(
  "CommandRunner"
) {
  static make(exitCode: CommandRunnerService["exitCode"]): CommandRunnerService {
    const run = Effect.fn("CommandRunner.run")(function* (options: CommandRunOptions) {
      if (options.title !== undefined) {
        yield* printHeading(options.title, options.command)
      }

      const code = yield* exitCode(options)

      if (code !== ChildProcessSpawner.ExitCode(0)) {
        yield* new CommandFailed({ command: options.command, exitCode: code })
      }
    })

    // A blank line separates each step's output from the one before it.
    const toSections = (steps: readonly CommandRunOptions[]) =>
      steps.map((step, index) =>
        index === 0 ? run(step) : Effect.andThen(Console.log(""), run(step))
      )

    return {
      exitCode,
      run,
      runAll: Effect.fn("CommandRunner.runAll")(function* (steps) {
        const results = yield* Effect.all(toSections(steps), { concurrency: 1, mode: "result" })

        yield* Effect.fromResult(Result.all(results))
      }),
      runUntilFailure: Effect.fn("CommandRunner.runUntilFailure")(function* (steps) {
        yield* Effect.all(toSections(steps), { concurrency: 1, discard: true })
      }),
    }
  }

  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      return CommandRunner.make((options) =>
        exitCode(options).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)
        )
      )
    })
  )
}
