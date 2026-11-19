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
  // A variable without a value leaves the environment of the child.
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly name?: string
  readonly stderr?: "ignore" | "inherit"
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
  readonly title?: string
}

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

type Step<E, R> = Effect.Effect<CommandRunOptions, E, R>

export interface OutputChunk {
  readonly bytes: Uint8Array
  readonly stream: "stderr" | "stdout"
}

export type OutputSink = (chunk: OutputChunk) => Effect.Effect<void>

interface CommandRunnerService {
  readonly exitCode: (
    options: CommandRunOptions,
    output?: OutputSink
  ) => Effect.Effect<ChildProcessSpawner.ExitCode, CommandFailedLike>
  readonly run: (
    options: CommandRunOptions
  ) => Effect.Effect<void, CommandFailed | CommandFailedLike>
  readonly runAll: <E, R>(
    steps: ReadonlyArray<Step<E, R>>
  ) => Effect.Effect<void, E | CommandFailed | CommandFailedLike, R>
  readonly runConcurrently: <E, R>(
    steps: ReadonlyArray<Step<E, R>>
  ) => Effect.Effect<void, E | CommandFailed | CommandFailedLike, R | Stdio.Stdio>
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

    // A blank line separates a heading from the section above it. A section without a heading
    // follows the one above it directly.
    function toSections<E, R>(steps: ReadonlyArray<Step<E, R>>) {
      return steps.map((step, index) =>
        Effect.flatMap(step, (options) =>
          index === 0 || options.title === undefined
            ? run(options)
            : Effect.andThen(Console.log(""), run(options))
        )
      )
    }

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

        // A child that writes to a pipe prints color only when told to, and Oxlint and Oxfmt read
        // `FORCE_COLOR`.
        function toColored(step: CommandRunOptions) {
          return canColor ? { ...step, env: { ...step.env, FORCE_COLOR: "1" } } : step
        }

        const write = (chunk: OutputChunk) =>
          Stream.run(Stream.succeed(chunk.bytes), stdio[chunk.stream]())

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

        const print = Effect.forEach(
          sections.flatMap(({ found, queue }) =>
            Result.isSuccess(found) ? [{ queue, step: found.success }] : []
          ),
          ({ queue, step }, index) =>
            Effect.gen(function* () {
              if (step.title !== undefined) {
                if (index > 0) {
                  yield* Console.log("")
                }

                yield* Console.log(toHeading({ ...step, title: step.title }))
              }

              yield* Stream.runForEach(Stream.fromQueue(queue), write)
            }),
          { concurrency: 1, discard: true }
        )

        const [results] = yield* Effect.all([runs, print], { concurrency: "unbounded" })

        yield* Effect.fromResult(Result.all(sections.map(({ found }) => found)))
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

      // Oxlint and Oxfmt load TypeScript configs through Node.js, which warns about each typeless
      // `package.json` that it reparses as ESM. With a default, `Config.String` fails only when the
      // provider cannot read its source.
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
                  // A child that reads the terminal stays in this process group, where terminal
                  // signals such as SIGINT and SIGWINCH reach it. On POSIX, the platform spawner
                  // starts any other child in a new session.
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
