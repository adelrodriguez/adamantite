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
import * as Ref from "effect/Ref"
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

const exitCode = Effect.fn("CommandRunner.exitCode")(function* ({
  args,
  command,
  cwd,
  detached,
  env,
  stderr = "inherit",
  stdin = "ignore",
  stdout = "inherit",
}: CommandRunOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        cwd,
        detached,
        env: { ...env, NODE_OPTIONS: quietNodeOptions() },
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

const DEFAULT_STDERR_LIMIT_BYTES = 64 * 1024
const FORCE_KILL_GRACE = "2 seconds"

function appendTail(current: Uint8Array, chunk: Uint8Array, limit: number): Uint8Array {
  if (limit === 0) {
    return new Uint8Array()
  }

  return Buffer.concat([current, chunk]).subarray(-limit)
}

const capture = Effect.fn("CommandRunner.capture")(function* ({
  args,
  captureStdout = true,
  command,
  cwd,
  detached,
  env,
  stderrLimitBytes = DEFAULT_STDERR_LIMIT_BYTES,
  stdin = "ignore",
  timeout,
}: CapturedCommandRunOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        cwd,
        detached,
        env: { ...env, NODE_OPTIONS: quietNodeOptions() },
        extendEnv: true,
        forceKillAfter: FORCE_KILL_GRACE,
        stderr: "pipe",
        stdin,
        stdout: captureStdout ? "pipe" : "ignore",
      })
      const stdoutChunks = yield* Ref.make<readonly Uint8Array[]>([])
      const stderrTail = yield* Ref.make<Uint8Array>(new Uint8Array())
      const stdoutFiber = yield* Stream.runForEach(handle.stdout, (chunk) =>
        Ref.update(stdoutChunks, (chunks) => [...chunks, chunk])
      ).pipe(Effect.forkScoped)
      const stderrFiber = yield* Stream.runForEach(handle.stderr, (chunk) =>
        Ref.update(stderrTail, (current) => appendTail(current, chunk, stderrLimitBytes))
      ).pipe(Effect.forkScoped)
      let completedCode: ChildProcessSpawner.ExitCode | null
      if (timeout === undefined) {
        completedCode = yield* handle.exitCode
      } else {
        const completed = yield* Effect.timeoutOption(handle.exitCode, timeout)
        completedCode = Option.getOrNull(completed)
      }

      if (completedCode === null) {
        yield* handle.kill({ forceKillAfter: FORCE_KILL_GRACE })
      }

      yield* Fiber.join(stdoutFiber)
      yield* Fiber.join(stderrFiber)

      const stdout = Buffer.concat(yield* Ref.get(stdoutChunks)).toString("utf8")
      const stderr = Buffer.from(yield* Ref.get(stderrTail)).toString("utf8")

      return completedCode === null
        ? ({ exitCode: null, status: "timed-out", stderr, stdout } as const)
        : ({ exitCode: completedCode, status: "exited", stderr, stdout } as const)
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
  static make(
    exitCode: CommandRunnerService["exitCode"],
    captureOutput: CommandRunnerService["capture"] = (options) =>
      exitCode(options).pipe(
        Effect.map((code) => ({
          exitCode: code,
          status: "exited" as const,
          stderr: "",
          stdout: "",
        }))
      )
  ): CommandRunnerService {
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
      capture: captureOutput,
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

      return CommandRunner.make(
        (options) =>
          exitCode(options).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)
          ),
        (options) =>
          capture(options).pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)
          )
      )
    })
  )
}
