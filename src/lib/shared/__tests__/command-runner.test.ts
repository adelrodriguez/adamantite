import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import { CommandRunner } from "#lib/shared/command-runner.ts"

function makeSpawnerLayer(spawned: ChildProcess.CommandOptions[]) {
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
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.empty,
          unref: Effect.succeed(Effect.void),
        })
      )
    })
  )
}

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
})
