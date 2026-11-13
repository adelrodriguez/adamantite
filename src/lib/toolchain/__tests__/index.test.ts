import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { CommandRunner, type CommandRunOptions } from "#lib/execution/command-runner.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

describe("Toolchain", () => {
  it.effect("run a check for the supplied project without CLI command context", () =>
    Effect.gen(function* () {
      const invocations: CommandRunOptions[] = []

      const runner = CommandRunner.make((options) => {
        invocations.push(options)

        return Effect.succeed(ChildProcessSpawner.ExitCode(0))
      })

      yield* Toolchain.check({ cwd: "/target" }).pipe(Effect.provideService(CommandRunner, runner))

      expect(invocations).toMatchObject([
        { args: ["--check"], command: "oxfmt", cwd: "/target" },
        {
          args: [expect.any(String), "--deny-warnings"],
          command: "node",
          cwd: "/target",
          env: { ADAMANTITE_PROJECT: "/target" },
        },
      ])
    })
  )

  it.effect("format without output before the lint stage", () =>
    Effect.gen(function* () {
      const invocations: CommandRunOptions[] = []

      const runner = CommandRunner.make((options) => {
        invocations.push(options)

        // The first format fails, and the fix still runs the other stages and succeeds.
        return Effect.succeed(ChildProcessSpawner.ExitCode(invocations.length === 1 ? 2 : 0))
      })

      yield* Toolchain.fix({ cwd: "/target", files: ["index.ts"] }).pipe(
        Effect.provideService(CommandRunner, runner)
      )

      expect(invocations).toMatchObject([
        { args: ["--write", "index.ts"], command: "oxfmt", stderr: "ignore", stdout: "ignore" },
        { args: [expect.any(String), "--fix", "index.ts"], command: "node" },
        { args: ["--write", "index.ts"], command: "oxfmt" },
      ])
      // The lint and last format stages print their output.
      expect(invocations.slice(1).map((options) => options.stdout)).toStrictEqual([
        undefined,
        undefined,
      ])
    })
  )

  it("keep stage names specific to each operation", () => {
    expectTypeOf<Parameters<typeof Toolchain.check>[0]["only"]>().toEqualTypeOf<
      "format" | "lint" | undefined
    >()
    expectTypeOf<Parameters<typeof Toolchain.fix>[0]["only"]>().toEqualTypeOf<
      "format" | "lint" | undefined
    >()
    expectTypeOf<Parameters<typeof Toolchain.analyze>[0]["only"]>().toEqualTypeOf<
      "monorepo" | "unused" | undefined
    >()
  })
})
