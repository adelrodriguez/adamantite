import { join } from "node:path"
import process from "node:process"
import { stripVTControlCharacters } from "node:util"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import checkCommand from "#commands/check.ts"
import { getOxlintCommand } from "#lib/integrations/oxlint/entry.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { CommandFailed, InvalidCheckOptions, ToolNotSelected } from "#lib/shared/errors.ts"
import {
  createRunnerTestContext,
  getFailure,
  makeLockfileFile,
  runCommand,
} from "./command-test-helpers.ts"
import { makeSelection } from "./lifecycle.ts"

const OXLINT = getOxlintCommand(process.cwd())

describe("check", () => {
  describe("stage flags", () => {
    it.effect("run only the lint stage when selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "lint"], {
          forwardedArguments: ["--format", "github"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT,
            args: [...OXLINT.args, "--deny-warnings", "--format", "github"],
            title: "🔍 Linting",
          },
        ])
      })
    )

    it.effect("run only the format stage when selected and forward arguments to it", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "format"], {
          forwardedArguments: ["--no-error-on-unmatched-pattern"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: ["--check", "--no-error-on-unmatched-pattern"],
            command: "oxfmt",
            cwd: process.cwd(),
            title: "✨ Checking formatting",
          },
        ])
      })
    )
  })

  describe("warnings", () => {
    it.effect("make Oxlint fail on warnings", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, [], { layers: [runner.layer] })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            ...OXLINT,
            args: [...OXLINT.args, "--deny-warnings"],
          })
        )
      })
    )

    it.effect("let Oxlint pass on warnings with --allow-warnings", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, ["--allow-warnings"], { layers: [runner.layer] })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({ ...OXLINT, args: [...OXLINT.args] })
        )
      })
    )

    it.effect("reject --allow-warnings with the format stage", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "format", "--allow-warnings"], {
          layers: [runner.layer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(InvalidCheckOptions)
        expect(runner.invocations).toStrictEqual([])
      })
    )

    it.effect("pass a forwarded --deny-warnings to Oxlint one time", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, [], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            ...OXLINT,
            args: [...OXLINT.args, "--deny-warnings"],
          })
        )
      })
    )

    it.effect("keep a forwarded --max-warnings threshold", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, [], {
          forwardedArguments: ["--max-warnings=5"],
          layers: [runner.layer],
        })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            ...OXLINT,
            args: [...OXLINT.args, "--max-warnings=5"],
          })
        )
      })
    )
  })

  describe("output", () => {
    it.effect("print a heading before each tool", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        const logLines: unknown[] = []

        yield* runCommand(checkCommand, [], { layers: [runner.layer], logLines })

        expect(logLines.map((line) => stripVTControlCharacters(String(line)))).toStrictEqual([
          "✨ Checking formatting · adamantite (oxfmt)",
          "",
          "🔍 Linting · adamantite (oxlint)",
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after file arguments", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })

        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["index.ts"], {
          files,
          forwardedArguments: ["--format", "github"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: ["--check", join(files.root, "index.ts")],
            command: "oxfmt",
            cwd: process.cwd(),
            title: "✨ Checking formatting",
          },
          {
            ...OXLINT,
            args: [
              ...OXLINT.args,
              join(files.root, "index.ts"),
              "--deny-warnings",
              "--format",
              "github",
            ],
            title: "🔍 Linting",
          },
        ])
      })
    )
  })

  describe("selection", () => {
    it.effect("name the init command that adds check when the lockfile selects no script", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({ files: makeLockfileFile(makeSelection({})) }),
          layers: [runner.layer],
        })

        const error = getFailure(exit)

        expect(error).toStrictEqual(
          new ToolNotSelected({ script: "check", tools: ["oxfmt", "oxlint"] })
        )
        expect(error?.message).toBe(
          "The lockfile selects no script that runs `oxfmt` or `oxlint`, so Adamantite does not install them. Run `adamantite init --non-interactive --script check` to add the script and install them."
        )
        expect(runner.invocations).toStrictEqual([])
      })
    )

    it.effect("name only the tool of the stage that --only selects", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "lint"], {
          files: createFileSystemTestContext({
            files: makeLockfileFile(makeSelection({ scripts: ["analyze"] })),
          }),
          layers: [runner.layer],
        })

        const error = getFailure(exit)

        expect(error).toStrictEqual(new ToolNotSelected({ script: "check", tools: ["oxlint"] }))
        expect(error?.message).toBe(
          "The lockfile selects no script that runs `oxlint`, so Adamantite does not install it. Run `adamantite init --non-interactive --script check` to add the script and install it."
        )
        expect(runner.invocations).toStrictEqual([])
      })
    )

    // A selected tool that is missing fails in its own stage, where Oxlint names
    // `adamantite update`, which installs it.
    it.effect("run each stage when the lockfile selects a script that runs its tool", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([0, 1])

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({
            files: makeLockfileFile(makeSelection({ presets: ["core"], scripts: ["check"] })),
          }),
          layers: [runner.layer],
        })

        expect(getFailure(exit)).toMatchObject({ command: "node", exitCode: 1 })
        expect(
          runner.invocations.map((invocation) => invocation.name ?? invocation.command)
        ).toStrictEqual(["oxfmt", "oxlint"])
      })
    )

    // Doctor reports the lockfile, and the tools can still run.
    it.effect("run each stage when the lockfile does not decode", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({ files: { [LOCKFILE_PATH]: "<<<<<<< HEAD\n" } }),
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(
          runner.invocations.map((invocation) => invocation.name ?? invocation.command)
        ).toStrictEqual(["oxfmt", "oxlint"])
      })
    )
  })

  describe("error handling", () => {
    it.effect("run lint after formatting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2, 3])

        const exit = yield* runCommand(checkCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(CommandFailed)
        expect(error).toMatchObject({ command: "oxfmt", exitCode: 2 })
        expect(
          runner.invocations.map((invocation) => invocation.name ?? invocation.command)
        ).toStrictEqual(["oxfmt", "oxlint"])
      })
    )
  })
})
