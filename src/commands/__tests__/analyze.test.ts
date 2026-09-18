import { stripVTControlCharacters } from "node:util"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import analyzeCommand from "#commands/analyze.ts"
import { CliNotFound } from "#lib/shared/errors.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

function createMonorepoFiles() {
  return createFileSystemTestContext({
    files: { "package.json": JSON.stringify({ workspaces: ["packages/*"] }) },
  })
}

const sherifStep = { command: "sherif", stdin: "inherit", title: "📦 Analyzing the monorepo" }
const knipStep = { command: "knip", stdin: "ignore", title: "🧹 Analyzing unused code" }

describe("analyze", () => {
  describe("default invocation", () => {
    it.effect("run knip with no flags by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([{ ...knipStep, args: [] }])
      })
    )
  })

  describe("fix mode", () => {
    it.effect("add fix flags when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--fix"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--allow-remove-files"])
      })
    )
  })

  describe("strict mode", () => {
    it.effect("add strict flags when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--strict"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--production", "--strict"])
      })
    )
  })

  describe("combined flags", () => {
    it.effect("support fix and strict together", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--fix", "--strict"], {
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--fix",
          "--allow-remove-files",
          "--production",
          "--strict",
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after Adamantite-managed flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--strict"], {
          forwardedArguments: ["--directory", "packages/app"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--production",
          "--strict",
          "--directory",
          "packages/app",
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommand(analyzeCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })

  describe("monorepo stage", () => {
    it.effect("run sherif before knip in a monorepo", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        const logLines: unknown[] = []

        const exit = yield* runCommand(analyzeCommand, [], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
          logLines,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          { ...sherifStep, args: [] },
          { ...knipStep, args: [] },
        ])
        expect(logLines.map((line) => stripVTControlCharacters(String(line)))).toEqual([
          "📦 Analyzing the monorepo · adamantite (sherif)",
          "",
          "🧹 Analyzing unused code · adamantite (knip)",
        ])
      })
    )

    it.effect("skip sherif when a package.json declares no workspaces", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, [], {
          files: createFileSystemTestContext({ files: { "package.json": "{}" } }),
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([{ ...knipStep, args: [] }])
      })
    )

    it.effect("apply --fix to both stages and --strict to knip only", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--fix", "--strict"], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          { ...sherifStep, args: ["--fix"] },
          { ...knipStep, args: ["--fix", "--allow-remove-files", "--production", "--strict"] },
        ])
      })
    )

    it.effect("forward arguments to knip when no stage is selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(analyzeCommand, [], {
          files: createMonorepoFiles(),
          forwardedArguments: ["--directory", "packages/app"],
          layers: [runner.layer],
        })

        expect(runner.invocations.map((invocation) => invocation.args)).toEqual([
          [],
          ["--directory", "packages/app"],
        ])
      })
    )

    it.effect("run knip after a sherif failure in check mode and fail with sherif's code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2, 0])

        const exit = yield* runCommand(analyzeCommand, [], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
        })

        expect(runner.invocations.map((invocation) => invocation.command)).toEqual([
          "sherif",
          "knip",
        ])
        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
          _tag: "CommandFailed",
          command: "sherif",
          exitCode: 2,
        })
      })
    )

    it.effect("skip knip after a sherif failure under --fix", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1, 0])

        const exit = yield* runCommand(analyzeCommand, ["--fix"], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
        })

        expect(runner.invocations.map((invocation) => invocation.command)).toEqual(["sherif"])
        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
          _tag: "CommandFailed",
          command: "sherif",
        })
      })
    )

    it.effect("point to adamantite update when sherif is missing", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext({
          implementation: (options) => Effect.fail(new CliNotFound({ command: options.command })),
        })

        const exit = yield* runCommand(analyzeCommand, ["--only", "monorepo"], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
        })

        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CliNotFound", command: "sherif" })
        expect(error.message).toBe(
          "Command `sherif` not found. Run `adamantite update` to install it."
        )
      })
    )
  })

  describe("--only", () => {
    it.effect("run only sherif with --only monorepo", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--only", "monorepo"], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([{ ...sherifStep, args: [] }])
      })
    )

    it.effect("forward arguments to sherif with --only monorepo --fix", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--only", "monorepo", "--fix"], {
          files: createMonorepoFiles(),
          forwardedArguments: ["--select", "highest"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          { ...sherifStep, args: ["--fix", "--select", "highest"] },
        ])
      })
    )

    it.effect("run only knip with --only unused in a monorepo", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--only", "unused", "--fix"], {
          files: createMonorepoFiles(),
          forwardedArguments: ["--directory", "packages/app"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          { ...knipStep, args: ["--fix", "--allow-remove-files", "--directory", "packages/app"] },
        ])
      })
    )

    it.effect("behave like plain analyze with --only unused outside a monorepo", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--only", "unused"], {
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([{ ...knipStep, args: [] }])
      })
    )

    it.effect("reject --only monorepo outside a monorepo", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--only", "monorepo"], {
          layers: [runner.layer],
        })

        expect(runner.invocations).toEqual([])
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "InvalidAnalyzeOptions" })
        expect(error.message).toContain("no monorepo was detected")
      })
    )

    it.effect("reject --only monorepo --strict", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--only", "monorepo", "--strict"], {
          files: createMonorepoFiles(),
          layers: [runner.layer],
        })

        expect(runner.invocations).toEqual([])
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "InvalidAnalyzeOptions" })
        expect(error.message).toContain("`--strict` applies to the unused stage")
      })
    )
  })
})
