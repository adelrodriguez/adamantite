import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import analyzeCommand from "#commands/analyze.ts"
import checkCommand from "#commands/check.ts"
import fixCommand from "#commands/fix.ts"
import formatCommand from "#commands/format.ts"
import monorepoCommand from "#commands/monorepo.ts"
import typecheckCommand from "#commands/typecheck.ts"
import { type CommandRunOptions, CommandRunner } from "#services/command-runner.ts"
import { Cwd } from "#services/cwd.ts"

interface RunnerTestContext {
  readonly invocations: CommandRunOptions[]
  readonly layer: Layer.Layer<CommandRunner>
}

function createRunnerTestContext(exitCodes: number[] = [0]): RunnerTestContext {
  const remainingExitCodes = [...exitCodes]
  const invocations: CommandRunOptions[] = []

  return {
    invocations,
    layer: Layer.succeed(CommandRunner)({
      run: (options) =>
        Effect.sync(() => {
          invocations.push({
            ...options,
            args: [...options.args],
          })
          return remainingExitCodes.shift() ?? 0
        }),
    }),
  }
}

async function runCommand(
  command: Command.Command.Any,
  args: string[],
  runner: RunnerTestContext,
  cwd: string
) {
  const cwdLayer = Layer.succeed(Cwd)({
    get: Effect.succeed(cwd),
  })

  return Effect.runPromiseExit(
    Command.runWith(command, { version: "test" })(args).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, cwdLayer, runner.layer))
    )
  )
}

describe("command behavior", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-command-behavior-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("check", () => {
    test("runs oxlint with type-aware mode by default", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(checkCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: ["--type-aware"],
          command: "oxlint",
        },
      ])
    })

    test("appends file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommand(checkCommand, ["index.ts"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: ["--type-aware", realpathSync(join(tempDir, "index.ts"))],
          command: "oxlint",
        },
      ])
    })

    test("fails with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([2])
      const exit = await runCommand(checkCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.findErrorOption(exit)
      expect(Option.isSome(error)).toBe(true)
      expect(Option.getOrThrow(error)._tag).toBe("CommandFailed")
    })
  })

  describe("fix", () => {
    test("always includes type-aware and fix flags", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(fixCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: ["--type-aware", "--fix"],
          command: "oxlint",
        },
      ])
    })

    test("adds suggested fixes when requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(fixCommand, ["--suggested"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--type-aware", "--fix", "--fix-suggestions"])
    })

    test("adds dangerous fixes when requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(fixCommand, ["--dangerous"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--type-aware", "--fix", "--fix-dangerously"])
    })

    test("adds all fix modes when all is requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(fixCommand, ["--all"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        "--type-aware",
        "--fix",
        "--fix-suggestions",
        "--fix-dangerously",
      ])
    })

    test("deduplicates duplicate file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommand(fixCommand, ["index.ts", "index.ts"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        "--type-aware",
        "--fix",
        realpathSync(join(tempDir, "index.ts")),
      ])
    })

    test("fails with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])
      const exit = await runCommand(fixCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.findErrorOption(exit)
      expect(Option.isSome(error)).toBe(true)
      expect(Option.getOrThrow(error)._tag).toBe("CommandFailed")
    })
  })

  describe("format", () => {
    test("runs oxfmt with no flags by default", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(formatCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "oxfmt",
        },
      ])
    })

    test("adds the check flag when requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(formatCommand, ["--check"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--check"])
    })

    test("appends file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommand(formatCommand, ["index.ts"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([realpathSync(join(tempDir, "index.ts"))])
    })

    test("fails with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])
      const exit = await runCommand(formatCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.findErrorOption(exit)
      expect(Option.isSome(error)).toBe(true)
      expect(Option.getOrThrow(error)._tag).toBe("CommandFailed")
    })
  })

  describe("typecheck", () => {
    test("runs tsc with noEmit in the current working directory", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(typecheckCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: ["--noEmit"],
          command: "tsc",
          cwd: tempDir,
        },
      ])
    })

    test("adds project and watch options when requested", async () => {
      await writeFile(join(tempDir, "tsconfig.test.json"), '{"compilerOptions":{"noEmit":true}}\n')
      const runner = createRunnerTestContext()

      const exit = await runCommand(
        typecheckCommand,
        ["--project", "tsconfig.test.json", "--watch"],
        runner,
        tempDir
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]).toEqual({
        args: [
          "--noEmit",
          "--project",
          realpathSync(join(tempDir, "tsconfig.test.json")),
          "--watch",
        ],
        command: "tsc",
        cwd: tempDir,
      })
    })

    test("fails with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])
      const exit = await runCommand(typecheckCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.findErrorOption(exit)
      expect(Option.isSome(error)).toBe(true)
      expect(Option.getOrThrow(error)._tag).toBe("CommandFailed")
    })
  })

  describe("analyze", () => {
    test("runs knip with no flags by default", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(analyzeCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "knip",
        },
      ])
    })

    test("adds fix flags when requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(analyzeCommand, ["--fix"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--fix", "--allow-remove-files"])
    })

    test("adds strict flags when requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(analyzeCommand, ["--strict"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--production", "--strict"])
    })

    test("supports fix and strict together", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(analyzeCommand, ["--fix", "--strict"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        "--fix",
        "--allow-remove-files",
        "--production",
        "--strict",
      ])
    })

    test("fails with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])
      const exit = await runCommand(analyzeCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.findErrorOption(exit)
      expect(Option.isSome(error)).toBe(true)
      expect(Option.getOrThrow(error)._tag).toBe("CommandFailed")
    })
  })

  describe("monorepo", () => {
    test("runs sherif by default", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(monorepoCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "sherif",
          stdin: "inherit",
        },
      ])
    })

    test("adds fix when requested", async () => {
      const runner = createRunnerTestContext()
      const exit = await runCommand(monorepoCommand, ["--fix"], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]).toEqual({
        args: ["--fix"],
        command: "sherif",
        stdin: "inherit",
      })
    })

    test("fails with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])
      const exit = await runCommand(monorepoCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.findErrorOption(exit)
      expect(Option.isSome(error)).toBe(true)
      expect(Option.getOrThrow(error)._tag).toBe("CommandFailed")
    })
  })
})
