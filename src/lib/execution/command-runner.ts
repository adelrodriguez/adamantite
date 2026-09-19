import type * as Duration from "effect/Duration"
import type * as PlatformError from "effect/PlatformError"
import process from "node:process"
import { styleText } from "node:util"
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Stream from "effect/Stream"
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
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly stderr?: "ignore" | "inherit"
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
  /**
   * What the command is doing, such as `"✨ Checking formatting"`. When set, `run` prints it as a
   * heading above the command's inherited output.
   */
  readonly title?: string
}

export interface CapturedCommandRunOptions extends Omit<
  CommandRunOptions,
  "stderr" | "stdout" | "title"
> {
  /**
   * Retain stdout. Set to false when the caller only needs the exit status and stderr.
   */
  readonly captureStdout?: boolean
  /**
   * Maximum bytes retained from the end of stderr. The complete stream is still drained.
   */
  readonly stderrLimitBytes?: number
  readonly timeout?: Duration.Input
}

export type CapturedCommandResult =
  | {
      readonly exitCode: ChildProcessSpawner.ExitCode
      readonly status: "exited"
      readonly stderr: string
      readonly stdout: string
    }
  | {
      readonly exitCode: null
      readonly status: "timed-out"
      readonly stderr: string
      readonly stdout: string
    }

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

interface CommandRunnerService {
  readonly capture: (
    options: CapturedCommandRunOptions
  ) => Effect.Effect<CapturedCommandResult, CommandFailedLike>
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
function quietNodeOptions() {
  const existing = process.env["NODE_OPTIONS"]
  return existing === undefined
    ? "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"
    : `${existing} --disable-warning=MODULE_TYPELESS_PACKAGE_JSON`
}

type SpawnOptions = Pick<CommandRunOptions, "args" | "command" | "cwd" | "detached" | "env">

const spawn = (
  { args, command, cwd, detached, env }: SpawnOptions,
  stdio: Pick<ChildProcess.CommandOptions, "forceKillAfter" | "stderr" | "stdin" | "stdout">
) =>
  ChildProcess.make(command, args, {
    cwd,
    detached,
    env: { ...env, NODE_OPTIONS: quietNodeOptions() },
    extendEnv: true,
    ...stdio,
  })

const mapNotFound = (command: string) =>
  Effect.mapError((cause: PlatformError.PlatformError) =>
    cause.reason._tag === "NotFound" ? new CliNotFound({ command }) : cause
  )

const exitCode = Effect.fn("CommandRunner.exitCode")(function* ({
  stderr = "inherit",
  stdin = "ignore",
  stdout = "inherit",
  ...options
}: CommandRunOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawn(options, { stderr, stdin, stdout })

      return yield* handle.exitCode
    })
  ).pipe(mapNotFound(options.command))
})

const DEFAULT_STDERR_LIMIT_BYTES = 64 * 1024
const FORCE_KILL_GRACE = "2 seconds"

const capture = Effect.fn("CommandRunner.capture")(function* ({
  captureStdout = true,
  stderrLimitBytes = DEFAULT_STDERR_LIMIT_BYTES,
  stdin = "ignore",
  timeout,
  ...options
}: CapturedCommandRunOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawn(options, {
        forceKillAfter: FORCE_KILL_GRACE,
        stderr: "pipe",
        stdin,
        stdout: captureStdout ? "pipe" : "ignore",
      })
      const stdoutFiber = yield* Stream.mkString(Stream.decodeText(handle.stdout)).pipe(
        Effect.forkScoped
      )
      const stderrFiber = yield* handle.stderr.pipe(
        Stream.runFold(
          () => Buffer.alloc(0),
          (tail, chunk) =>
            stderrLimitBytes === 0 ? tail : Buffer.concat([tail, chunk]).subarray(-stderrLimitBytes)
        ),
        Effect.forkScoped
      )
      const completedCode =
        timeout === undefined
          ? yield* handle.exitCode
          : Option.getOrNull(yield* Effect.timeoutOption(handle.exitCode, timeout))

      if (completedCode === null) {
        yield* handle.kill({ forceKillAfter: FORCE_KILL_GRACE })
      }

      // A pipe stays open while a process that left the group holds it, so the joins have a bound.
      // The scope interrupts a fiber that does not finish.
      const stdout = Option.getOrElse(
        yield* Effect.timeoutOption(Fiber.join(stdoutFiber), FORCE_KILL_GRACE),
        () => ""
      )
      const stderr = Option.getOrElse(
        yield* Effect.timeoutOption(Fiber.join(stderrFiber), FORCE_KILL_GRACE),
        () => Buffer.alloc(0)
      ).toString("utf8")

      return completedCode === null
        ? ({ exitCode: null, status: "timed-out", stderr, stdout } as const)
        : ({ exitCode: completedCode, status: "exited", stderr, stdout } as const)
    })
  ).pipe(mapNotFound(options.command))
})

export class CommandRunner extends Context.Service<CommandRunner, CommandRunnerService>()(
  "CommandRunner"
) {
  static make({
    capture,
    exitCode,
  }: Pick<CommandRunnerService, "capture" | "exitCode">): CommandRunnerService {
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
      capture,
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

      return CommandRunner.make({
        capture: (options) =>
          capture(options).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)
          ),
        exitCode: (options) =>
          exitCode(options).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)
          ),
      })
    })
  )
}
