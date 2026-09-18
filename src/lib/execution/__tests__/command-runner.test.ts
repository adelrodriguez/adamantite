import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import { TestClock } from "effect/testing"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandRunner } from "#lib/execution/command-runner.ts"

const encoder = new TextEncoder()

function makeHandle(options: {
  readonly exitCode?: Effect.Effect<ChildProcessSpawner.ExitCode>
  readonly onKill?: (options: Parameters<ChildProcessSpawner.ChildProcessHandle["kill"]>[0]) => void
  readonly stderr?: string
  readonly stdout?: string
}) {
  return ChildProcessSpawner.makeHandle({
    all: Stream.empty,
    exitCode: options.exitCode ?? Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    isRunning: Effect.succeed(true),
    kill: (killOptions) =>
      Effect.sync(() => {
        options.onKill?.(killOptions)
      }),
    pid: ChildProcessSpawner.ProcessId(1),
    stderr: Stream.make(encoder.encode(options.stderr ?? "")),
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(options.stdout ?? "")),
    unref: Effect.succeed(Effect.void),
  })
}

function runnerLayer(handle: ChildProcessSpawner.ChildProcessHandle): Layer.Layer<CommandRunner> {
  const spawner = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.succeed(handle))
  )
  return CommandRunner.layer.pipe(Layer.provide(spawner))
}

describe("CommandRunner.capture", () => {
  it.effect("capture stdout and retain only the configured stderr tail", () =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner
      const result = yield* runner.capture({
        args: [],
        command: "tool",
        stderrLimitBytes: 4,
      })

      expect(result).toEqual({
        exitCode: 0,
        status: "exited",
        stderr: "cdef",
        stdout: "result",
      })
    }).pipe(Effect.provide(runnerLayer(makeHandle({ stderr: "abcdef", stdout: "result" }))))
  )

  it.effect("report a timeout and request SIGTERM to SIGKILL escalation", () => {
    let killOptions: unknown
    return Effect.gen(function* () {
      const runner = yield* CommandRunner
      const fiber = yield* runner
        .capture({ args: [], command: "tool", timeout: "1 second" })
        .pipe(Effect.forkChild)

      yield* TestClock.adjust("1 second")
      const result = yield* Fiber.join(fiber)

      expect(result.status).toBe("timed-out")
      expect(killOptions).toEqual({ forceKillAfter: "2 seconds" })
    }).pipe(
      Effect.provide(
        runnerLayer(
          makeHandle({
            exitCode: Effect.never,
            onKill: (options) => {
              killOptions = options
            },
          })
        )
      )
    )
  })
})
