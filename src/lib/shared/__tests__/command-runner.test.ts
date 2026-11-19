import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as TerminalCapabilities from "effect/cli/TerminalCapabilities"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Sink from "effect/Sink"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"
import * as TestConsole from "effect/testing/TestConsole"
import {
  CommandRunner,
  type CommandRunOptions,
  type OutputSink,
} from "#lib/shared/command-runner.ts"
import { CommandFailed, PackageNotInstalled } from "#lib/shared/errors.ts"

function toStream(text: string | undefined) {
  return text === undefined ? Stream.empty : Stream.succeed(new TextEncoder().encode(text))
}

function makeSpawnerLayer(
  spawned: ChildProcess.CommandOptions[],
  output: { readonly stderr?: string; readonly stdout?: string } = {}
) {
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make((command) => {
      if (ChildProcess.isStandardCommand(command)) {
        spawned.push(command.options)
      }

      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: toStream(output.stderr),
          stdin: Sink.drain,
          stdout: toStream(output.stdout),
          unref: Effect.succeed(Effect.void),
        })
      )
    })
  )
}

const FORMAT = Effect.succeed<CommandRunOptions>({ args: [], command: "oxfmt", title: "Format" })
const LINT = Effect.succeed<CommandRunOptions>({ args: [], command: "oxlint", title: "Lint" })

// The steps of `check` when it prints no heading, such as in an agent's shell.
const UNTITLED = [
  Effect.succeed<CommandRunOptions>({ args: [], command: "oxfmt" }),
  Effect.succeed<CommandRunOptions>({ args: [], command: "oxlint" }),
]

/**
 * A step that finds no command, as the Oxlint step does in a project without Oxlint.
 */
const MISSING = new PackageNotInstalled({ packageName: "oxlint", project: "/project" })

describe("CommandRunner", () => {
  it.effect("keep a child that reads the terminal in this process group", () =>
    Effect.gen(function* () {
      const spawned: ChildProcess.CommandOptions[] = []

      // A child in a new session misses the SIGINT and SIGWINCH of the terminal that it reads.
      yield* Effect.gen(function* () {
        const runner = yield* CommandRunner
        yield* runner.exitCode({ args: [], command: "sherif", stdin: "inherit" })
        yield* runner.exitCode({ args: [], command: "knip", stdin: "ignore" })
      }).pipe(Effect.provide(CommandRunner.layer.pipe(Layer.provide(makeSpawnerLayer(spawned)))))

      expect(spawned.map((options) => options.detached)).toStrictEqual([false, undefined])
    })
  )

  it.effect("keep the NODE_OPTIONS of the environment and quiet the typeless package warning", () =>
    Effect.gen(function* () {
      const spawned: ChildProcess.CommandOptions[] = []

      const runWith = (env: Record<string, string>) =>
        Effect.gen(function* () {
          const runner = yield* CommandRunner
          yield* runner.exitCode({ args: [], command: "oxfmt" })
        }).pipe(
          Effect.provide(CommandRunner.layer.pipe(Layer.provide(makeSpawnerLayer(spawned)))),
          Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(env))
        )

      yield* runWith({ NODE_OPTIONS: "--max-old-space-size=4096" })
      yield* runWith({})

      expect(spawned.map((options) => options.env?.["NODE_OPTIONS"])).toStrictEqual([
        "--max-old-space-size=4096 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      ])
    })
  )

  it.effect(
    "pipe the output of a child to the sink, and keep a stream that the options ignore",
    () =>
      Effect.gen(function* () {
        const spawned: ChildProcess.CommandOptions[] = []
        const chunks: string[] = []

        yield* Effect.gen(function* () {
          const runner = yield* CommandRunner
          yield* runner.exitCode({ args: [], command: "oxlint", stderr: "ignore" }, (chunk) =>
            Effect.sync(() => {
              chunks.push(`${chunk.stream}: ${new TextDecoder().decode(chunk.bytes)}`)
            })
          )
        }).pipe(
          Effect.provide(
            CommandRunner.layer.pipe(
              Layer.provide(makeSpawnerLayer(spawned, { stdout: "lint report" }))
            )
          )
        )

        expect({
          chunks,
          streams: spawned.map(({ stderr, stdout }) => ({ stderr, stdout })),
        }).toStrictEqual({
          chunks: ["stdout: lint report"],
          streams: [{ stderr: "ignore", stdout: "pipe" }],
        })
      })
  )

  describe("runConcurrently", () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    /**
     * A test `Stdio` and `Console` that record every line in one list, in the order of the writes.
     */
    function makeTerminal() {
      const lines: string[] = []

      const record = (stream: string) => () =>
        Sink.forEach((chunk: string | Uint8Array) =>
          Effect.sync(() => {
            lines.push(`${stream}: ${typeof chunk === "string" ? chunk : decoder.decode(chunk)}`)
          })
        )

      const layer = Layer.mergeAll(
        Stdio.layerTest({ stderr: record("stderr"), stdout: record("stdout") }),
        TestConsole.layer
      )

      return { layer, lines }
    }

    const print = (output: OutputSink, stream: "stderr" | "stdout", text: string) =>
      output({ bytes: encoder.encode(text), stream })

    const steps = [FORMAT, LINT]

    it.effect("start every step at once, and print each section in the order of the steps", () =>
      Effect.gen(function* () {
        const terminal = makeTerminal()
        const lintPrinted = yield* Latch.make()

        // Oxfmt ends only after Oxlint printed, so the steps overlap, and Oxlint's output comes
        // first.
        const runner = CommandRunner.make((options, output) =>
          Effect.gen(function* () {
            if (output === undefined) {
              return yield* Effect.die("Expected an output sink.")
            }

            if (options.command === "oxlint") {
              yield* print(output, "stdout", "lint report")
              yield* Latch.open(lintPrinted)
            } else {
              yield* lintPrinted.await
              yield* print(output, "stderr", "format report")
            }

            return ChildProcessSpawner.ExitCode(0)
          })
        )

        yield* runner.runConcurrently(steps).pipe(Effect.provide(terminal.layer))

        const logs = yield* TestConsole.logLines.pipe(Effect.provide(terminal.layer))

        // A sequential run would wait for Oxfmt forever, so the test would time out.
        expect({ logs, output: terminal.lines }).toStrictEqual({
          logs: ["Format · adamantite (oxfmt)", "", "Lint · adamantite (oxlint)"],
          output: ["stderr: format report", "stdout: lint report"],
        })
      })
    )

    it.effect("print no blank line between sections without a heading", () =>
      Effect.gen(function* () {
        const terminal = makeTerminal()
        const runner = CommandRunner.make(() => Effect.succeed(ChildProcessSpawner.ExitCode(0)))

        yield* runner.runConcurrently(UNTITLED).pipe(Effect.provide(terminal.layer))

        expect(yield* TestConsole.logLines.pipe(Effect.provide(terminal.layer))).toStrictEqual([])
      })
    )

    it.effect("run every step, then fail with the first failure in the order of the steps", () =>
      Effect.gen(function* () {
        const terminal = makeTerminal()
        const started: string[] = []

        const runner = CommandRunner.make((options) =>
          Effect.sync(() => {
            started.push(options.command)

            return ChildProcessSpawner.ExitCode(options.command === "oxfmt" ? 1 : 2)
          })
        )

        const error = yield* Effect.flip(
          runner.runConcurrently(steps).pipe(Effect.provide(terminal.layer))
        )

        expect(error).toBeInstanceOf(CommandFailed)
        expect({ error, started: EffectArray.sort(started, Order.String) }).toMatchObject({
          error: { command: "oxfmt", exitCode: 1 },
          started: ["oxfmt", "oxlint"],
        })
      })
    )

    it.effect("start only the steps that find a command, and keep each failure in step order", () =>
      Effect.gen(function* () {
        const terminal = makeTerminal()
        const started: string[] = []

        const runner = CommandRunner.make((options) =>
          Effect.sync(() => {
            started.push(options.command)

            return ChildProcessSpawner.ExitCode(1)
          })
        )

        const error = yield* Effect.flip(
          runner
            .runConcurrently([Effect.fail(MISSING), FORMAT])
            .pipe(Effect.provide(terminal.layer))
        )

        const logs = yield* TestConsole.logLines.pipe(Effect.provide(terminal.layer))

        expect({ error, logs, started }).toStrictEqual({
          error: MISSING,
          logs: ["Format · adamantite (oxfmt)"],
          started: ["oxfmt"],
        })
      })
    )

    it.effect.each([
      { canColor: true, env: { FORCE_COLOR: "1" } },
      { canColor: false, env: undefined },
    ])("set FORCE_COLOR when the terminal can color: $canColor", ({ canColor, env }) =>
      Effect.gen(function* () {
        const terminal = makeTerminal()
        const seen: Array<CommandRunOptions["env"]> = []

        const runner = CommandRunner.make((options) =>
          Effect.sync(() => {
            seen.push(options.env)

            return ChildProcessSpawner.ExitCode(0)
          })
        )

        yield* runner.runConcurrently(steps.slice(0, 1)).pipe(
          Effect.provide(terminal.layer),
          Effect.provideService(TerminalCapabilities.TerminalCapabilities, {
            canAnimate: false,
            canColor,
            canPrompt: false,
          })
        )

        expect(seen).toStrictEqual([env])
      })
    )
  })

  describe("sections without a heading", () => {
    it.effect.each(["runAll", "runUntilFailure"] as const)(
      "$0 prints no blank line between them",
      (method) =>
        Effect.gen(function* () {
          const runner = CommandRunner.make(() => Effect.succeed(ChildProcessSpawner.ExitCode(0)))

          const logs = yield* runner[method](UNTITLED).pipe(
            Effect.andThen(TestConsole.logLines),
            Effect.provide(TestConsole.layer)
          )

          expect(logs).toStrictEqual([])
        })
    )
  })

  describe("a step that finds no command", () => {
    it.effect.each([
      { method: "runAll", started: ["oxfmt"] },
      { method: "runUntilFailure", started: [] },
    ] as const)("$method fails with the failure of the step", ({ method, started }) =>
      Effect.gen(function* () {
        const seen: string[] = []

        const runner = CommandRunner.make((options) =>
          Effect.sync(() => {
            seen.push(options.command)

            return ChildProcessSpawner.ExitCode(0)
          })
        )

        const error = yield* Effect.flip(
          runner[method]([Effect.fail(MISSING), FORMAT]).pipe(Effect.provide(TestConsole.layer))
        )

        expect({ error, started: seen }).toStrictEqual({ error: MISSING, started })
      })
    )
  })
})
