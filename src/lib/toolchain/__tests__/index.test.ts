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

  it.effect("report only the second round of a fix", () =>
    Effect.gen(function* () {
      const invocations: CommandRunOptions[] = []

      const runner = CommandRunner.make((options) => {
        invocations.push(options)

        // The first round lint still has the reports that the second round fixes.
        return Effect.succeed(ChildProcessSpawner.ExitCode(invocations.length === 2 ? 1 : 0))
      })

      yield* Toolchain.fix({ cwd: "/target", files: ["index.ts"] }).pipe(
        Effect.provideService(CommandRunner, runner)
      )

      const quiet = { stderr: "ignore", stdout: "ignore" }

      expect(invocations).toMatchObject([
        { ...quiet, args: ["--write", "index.ts"], command: "oxfmt" },
        { ...quiet, args: [expect.any(String), "--fix", "index.ts"], command: "node" },
        { ...quiet, args: ["--write", "index.ts"], command: "oxfmt" },
        { args: [expect.any(String), "--fix", "index.ts"], command: "node" },
        { args: ["--write", "index.ts"], command: "oxfmt" },
      ])
      // The second round prints its output, so the user sees the reports that remain.
      expect(invocations.slice(3).map((options) => options.stdout)).toStrictEqual([
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
