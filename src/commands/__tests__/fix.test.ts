import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import fixCommand from "#commands/fix.ts"
import { getOxlintCommand } from "#lib/integrations/tooling/oxlint/entry.ts"
import { CommandFailed, InvalidFixOptions } from "#lib/shared/errors.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

const OXLINT = getOxlintCommand(process.cwd())

/**
 * The format stage that runs without output before the lint stage.
 */
function quietFormat(args: readonly string[]) {
  return {
    args: ["--write", ...args],
    command: "oxfmt",
    cwd: process.cwd(),
    stderr: "ignore",
    stdout: "ignore",
    title: "✨ Formatting",
  }
}

describe("fix", () => {
  describe("default invocation", () => {
    it.effect("format without output, then lint before formatting", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          quietFormat([]),
          {
            ...OXLINT,
            args: [...OXLINT.args, "--fix"],
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write"],
            command: "oxfmt",
            cwd: process.cwd(),
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

        const exit = yield* runCommand(fixCommand, args, { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(
          runner.invocations.find((invocation) => invocation.name === "oxlint")?.args
        ).toStrictEqual([...OXLINT.args, "--fix", "--fix-suggestions", "--fix-dangerously"])
      })
    )
  })

  describe("stage flags", () => {
    it.effect("run only the lint stage when selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "lint", "--suggested"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT,
            args: [...OXLINT.args, "--fix", "--fix-suggestions", "--deny-warnings"],
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
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: ["--write", "--no-error-on-unmatched-pattern"],
            command: "oxfmt",
            cwd: process.cwd(),
            title: "✨ Formatting",
          },
        ])
      })
    )

    it.effect("reject lint fix modes with the format stage", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "format", "--all"], {
          layers: [runner.layer],
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
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          quietFormat([join(files.root, "index.ts")]),
          {
            ...OXLINT,
            args: [...OXLINT.args, "--fix", join(files.root, "index.ts")],
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write", join(files.root, "index.ts")],
            command: "oxfmt",
            cwd: process.cwd(),
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
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          quietFormat([]),
          {
            ...OXLINT,
            args: [...OXLINT.args, "--fix", "--fix-dangerously", "--deny-warnings"],
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write"],
            command: "oxfmt",
            cwd: process.cwd(),
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("run formatting after linting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([0, 1, 2])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(CommandFailed)
        expect(error).toMatchObject({ command: "node", exitCode: 1 })
        expect(
          runner.invocations.map((invocation) => invocation.name ?? invocation.command)
        ).toStrictEqual(["oxfmt", "oxlint", "oxfmt"])
      })
    )

    it.effect("ignore a failure of the first format stage", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2, 0, 0])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
      })
    )

    it.effect("report a formatting failure after linting succeeds", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([0, 0, 2])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(CommandFailed)
        expect(error).toMatchObject({ command: "oxfmt", exitCode: 2 })
      })
    )
  })
})
