import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import {
  createRunnerTestContext,
  getFailure,
  makeLockfileFile,
  makeToolsInstalledLayer,
  OXFMT_CLI,
  OXLINT_COMMAND,
  toolsInstalledLayer,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection } from "#__tests__/lifecycle.ts"
import fixCommand from "#commands/fix.ts"
import { CommandFailed, InvalidFixOptions, ToolNotSelected } from "#lib/shared/errors.ts"

describe("fix", () => {
  describe("default invocation", () => {
    it.effect("lint before formatting", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, [], {
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--fix"],
            title: "🔧 Fixing lint issues",
          },
          {
            args: [OXFMT_CLI, "--write"],
            command: "node",
            cwd: "/project",
            name: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("fix mode flags", () => {
    it.effect.each([
      { args: ["--all"], name: "all is requested" },
      { args: ["--suggested", "--dangerous"], name: "suggested and dangerous fixes are requested" },
    ])("add all fix modes when $name", ({ args }) =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, args, {
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toStrictEqual([
          ...OXLINT_COMMAND.args,
          "--fix",
          "--fix-suggestions",
          "--fix-dangerously",
        ])
      })
    )
  })

  describe("stage flags", () => {
    it.effect("run only the lint stage when selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "lint", "--suggested"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--fix", "--fix-suggestions", "--deny-warnings"],
            title: "🔧 Fixing lint issues",
          },
        ])
      })
    )

    it.effect("run only the format stage when selected and forward arguments to it", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "format"], {
          forwardedArguments: ["--no-error-on-unmatched-pattern"],
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: [OXFMT_CLI, "--write", "--no-error-on-unmatched-pattern"],
            command: "node",
            cwd: "/project",
            name: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )

    it.effect("reject lint fix modes with the format stage", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "format", "--all"], {
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(InvalidFixOptions)
        expect(runner.invocations).toStrictEqual([])
      })
    )
  })

  describe("file arguments", () => {
    it.effect("deduplicate duplicate file arguments", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })

        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["index.ts", "index.ts"], {
          files,
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--fix", join(files.root, "index.ts")],
            title: "🔧 Fixing lint issues",
          },
          {
            args: [OXFMT_CLI, "--write", join(files.root, "index.ts")],
            command: "node",
            cwd: "/project",
            name: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed fix flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--dangerous"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--fix", "--fix-dangerously", "--deny-warnings"],
            title: "🔧 Fixing lint issues",
          },
          {
            args: [OXFMT_CLI, "--write"],
            command: "node",
            cwd: "/project",
            name: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("selection", () => {
    it.effect(
      "name the init command that adds check when the lockfile selects no script and Oxfmt is missing",
      () =>
        Effect.gen(function* () {
          const runner = createRunnerTestContext()

          const exit = yield* runCommand(fixCommand, [], {
            files: createFileSystemTestContext({ files: makeLockfileFile(makeSelection({})) }),
            layers: [runner.layer, makeToolsInstalledLayer("oxlint")],
          })

          expect(getFailure(exit)).toStrictEqual(
            new ToolNotSelected({ script: "check", tool: "oxfmt" })
          )
        })
    )
  })

  describe("error handling", () => {
    it.effect("run formatting after linting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1, 2])

        const exit = yield* runCommand(fixCommand, [], {
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(CommandFailed)
        expect(error).toMatchObject({ command: "node", exitCode: 1 })
        expect(
          runner.invocations.map((invocation) => invocation.name ?? invocation.command)
        ).toStrictEqual(["oxlint", "oxfmt"])
      })
    )

    it.effect("report a formatting failure after linting succeeds", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([0, 2])

        const exit = yield* runCommand(fixCommand, [], {
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(CommandFailed)
        expect(error).toMatchObject({ command: "node", exitCode: 2 })
      })
    )
  })
})
