import type * as Cause from "effect/Cause"
import type * as PlatformError from "effect/PlatformError"
import { styleText } from "node:util"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Queue from "effect/Queue"
import * as Result from "effect/Result"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import { CliNotFound, CommandFailed } from "#lib/shared/errors.ts"

export interface CommandRunOptions {
  readonly args: string[]
  readonly command: string
  readonly cwd?: string
  /**
   * Variables to set for the child, on top of this process's environment.
   */
  readonly env?: Readonly<Record<string, string>>
  /**
   * The tool that the heading names, when `command` only starts it, such as `node` for Oxlint.
   */
  readonly name?: string
  readonly stderr?: "ignore" | "inherit"
  /**
   * A child with `"inherit"` reads the terminal, so it stays in this process group, where terminal
   * signals such as SIGINT and SIGWINCH reach it. Any other child starts in a new session on POSIX,
   * the default of the platform spawner.
   */
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
  /**
   * What the command is doing, such as `"✨ Checking formatting"`. When set, `run` prints it as a
   * heading above the command's inherited output.
   */
  readonly title?: string
}

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

/**
 * A step of `runAll`, `runConcurrently`, or `runUntilFailure`: the effect that finds the command to
 * run, such as the Oxlint command, which resolves the Oxlint runtime of the project. A step that
 * fails prints no section, and its failure counts as the failure of its command.
 */
type Step<E, R> = Effect.Effect<CommandRunOptions, E, R>

/**
 * Bytes that a child wrote to its standard output or its standard error.
 */
export interface OutputChunk {
  readonly bytes: Uint8Array
  readonly stream: "stderr" | "stdout"
}

/**
 * Receives the output of a child in place of the terminal.
 */
export type OutputSink = (chunk: OutputChunk) => Effect.Effect<void>

interface CommandRunnerService {
  /**
   * Runs the command and returns its exit code. With `output`, the streams that the options do not
   * ignore go to `output` instead of the terminal.
   */
  readonly exitCode: (
    options: CommandRunOptions,
    output?: OutputSink
  ) => Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike>
  readonly run: (
    options: CommandRunOptions
  ) => Effect.Effect<void, CommandFailed | CommandFailedLike>
  /**
   * Runs every step in order, even after one fails, then fails with the first failure.
   */
  readonly runAll: <E, R>(
    steps: ReadonlyArray<Step<E, R>>
  ) => Effect.Effect<void, E | CommandFailed | CommandFailedLike, R>
  /**
   * Starts every step at once, then fails with the first failure in step order, as `runAll` does.
   * The output keeps the order of `runAll`: each step's heading and output print after the steps
   * before it end, and the output of the first running step prints as it comes. Every step finds
   * its command before any command starts.
   */
  readonly runConcurrently: <E, R>(
    steps: ReadonlyArray<Step<E, R>>
  ) => Effect.Effect<void, E | CommandFailed | CommandFailedLike, R | Stdio.Stdio>
  /**
   * Runs the steps in order and stops at the first failure.
   */
  readonly runUntilFailure: <E, R>(
    steps: ReadonlyArray<Step<E, R>>
  ) => Effect.Effect<void, E | CommandFailed | CommandFailedLike, R>
}

function toHeading({ command, name, title }: CommandRunOptions & { readonly title: string }) {
  return `${styleText("bold", title)} ${styleText("dim", `· adamantite (${name ?? command})`)}`
}

const toResult = (options: CommandRunOptions, code: ChildProcessSpawner.ExitCode) =>
  code === ChildProcessSpawner.ExitCode(0)
    ? Effect.void
    : Effect.fail(new CommandFailed({ command: options.command, exitCode: code }))

export class CommandRunner extends Context.Service<CommandRunner, CommandRunnerService>()(
  "CommandRunner"
) {
  static make(exitCode: CommandRunnerService["exitCode"]): CommandRunnerService {
    const run = Effect.fn("CommandRunner.run")(function* (options: CommandRunOptions) {
      if (options.title !== undefined) {
        yield* Console.log(toHeading({ ...options, title: options.title }))
      }

      yield* toResult(options, yield* exitCode(options))
    })

    const toSections = <E, R>(steps: ReadonlyArray<Step<E, R>>) =>
      steps.map((step, index) =>
        Effect.flatMap(step, (options) =>
          index === 0 ? run(options) : Effect.andThen(Console.log(""), run(options))
        )
      )

    return {
      exitCode,
      run,
      runAll: Effect.fn("CommandRunner.runAll")(function* <E, R>(steps: ReadonlyArray<Step<E, R>>) {
        const results = yield* Effect.all(toSections(steps), { concurrency: 1, mode: "result" })

        yield* Effect.fromResult(Result.all(results))
      }),
      runConcurrently: Effect.fn("CommandRunner.runConcurrently")(function* <E, R>(
        steps: ReadonlyArray<Step<E, R>>
      ) {
        const stdio = yield* Stdio.Stdio
        const { canColor } = yield* TerminalCapabilities.TerminalCapabilities

        // A child writes to a pipe here, so it prints color only when told to. Oxlint and Oxfmt
        // read `FORCE_COLOR`.
        const toColored = (step: CommandRunOptions) =>
          canColor ? { ...step, env: { ...step.env, FORCE_COLOR: "1" } } : step

        const write = (chunk: OutputChunk) =>
          Stream.run(Stream.succeed(chunk.bytes), stdio[chunk.stream]())

        // Every step finds its command before any command starts, so the commands still start
        // together. A step that fails starts nothing and prints no section.
        const sections = yield* Effect.forEach(
          steps,
          (step) =>
            Effect.all(
              { found: Effect.result(step), queue: Queue.unbounded<OutputChunk, Cause.Done>() },
              { concurrency: "unbounded" }
            ),
          { concurrency: "unbounded" }
        )

        const runs = Effect.forEach(
          sections,
          ({ found, queue }) =>
            Effect.gen(function* () {
              const step = yield* Effect.fromResult(found)

              const code = yield* exitCode(toColored(step), (chunk) =>
                Effect.asVoid(Queue.offer(queue, chunk))
              )

              yield* toResult(step, code)
            }).pipe(Effect.ensuring(Queue.end(queue)), Effect.result),
          { concurrency: "unbounded" }
        )

        // Each section waits for the sections before it, so the output of a later step stays in
        // its queue until its turn.
        const print = Effect.forEach(
          sections.flatMap(({ found, queue }) =>
            Result.isSuccess(found) ? [{ queue, step: found.success }] : []
          ),
          ({ queue, step }, index) =>
            Effect.gen(function* () {
              if (index > 0) {
                yield* Console.log("")
              }

              if (step.title !== undefined) {
                yield* Console.log(toHeading({ ...step, title: step.title }))
              }

              yield* Stream.runForEach(Stream.fromQueue(queue), write)
            }),
          { concurrency: 1, discard: true }
        )

        const [results] = yield* Effect.all([runs, print], { concurrency: "unbounded" })

        yield* Effect.fromResult(Result.all(results))
      }),
      runUntilFailure: Effect.fn("CommandRunner.runUntilFailure")(function* <E, R>(
        steps: ReadonlyArray<Step<E, R>>
      ) {
        yield* Effect.all(toSections(steps), { concurrency: 1, discard: true })
      }),
    }
  }

  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      // Oxlint and Oxfmt load TypeScript configs through Node, which warns about every typeless
      // `package.json` it reparses as ESM. The warning is noise for users who cannot act on it.
      // Any string decodes, and the default covers a missing variable, so only a provider that
      // cannot read its source fails. That failure is a defect.
      const nodeOptions = yield* Config.String("NODE_OPTIONS").pipe(
        Config.withDefault(""),
        Config.map((options) =>
          [options, "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"].filter(Boolean).join(" ")
        ),
        Effect.orDie
      )

      return CommandRunner.make(
        Effect.fn("CommandRunner.exitCode")(function* (
          options: CommandRunOptions,
          output?: OutputSink
        ) {
          const { command } = options
          const stderr = options.stderr ?? "inherit"
          const stdout = options.stdout ?? "inherit"

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* spawner.spawn(
                ChildProcess.make(command, options.args, {
                  cwd: options.cwd,
                  detached: options.stdin === "inherit" ? false : undefined,
                  env: { ...options.env, NODE_OPTIONS: nodeOptions },
                  extendEnv: true,
                  stderr: output !== undefined && stderr === "inherit" ? "pipe" : stderr,
                  stdin: options.stdin ?? "ignore",
                  stdout: output !== undefined && stdout === "inherit" ? "pipe" : stdout,
                })
              )

              // A stream that the child does not pipe is empty, so it ends at once.
              if (output !== undefined) {
                yield* Effect.all(
                  [
                    Stream.runForEach(handle.stdout, (bytes) =>
                      output({ bytes, stream: "stdout" })
                    ),
                    Stream.runForEach(handle.stderr, (bytes) =>
                      output({ bytes, stream: "stderr" })
                    ),
                  ],
                  { concurrency: "unbounded", discard: true }
                )
              }

              return yield* handle.exitCode
            })
          ).pipe(
            Effect.catchReason("PlatformError", "NotFound", () =>
              Effect.fail(new CliNotFound({ command }))
            )
          )
        })
      )
    })
  )
}
