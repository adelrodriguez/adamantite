import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import {
  createRunnerTestContext,
  getFailure,
  makeHandoffRunner,
  makeLockfileFile,
  OXLINT_COMMAND,
  oxlintInstalledLayer,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection } from "#__tests__/lifecycle.ts"
import checkCommand from "#commands/check.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import {
  CliNotFound,
  CommandFailed,
  InvalidCheckOptions,
  ToolNotSelected,
} from "#lib/shared/errors.ts"

describe("check", () => {
  describe("stage flags", () => {
    it.effect("run only the lint stage when selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "lint"], {
          forwardedArguments: ["--format", "github"],
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--deny-warnings", "--format", "github"],
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
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: ["--check", "--no-error-on-unmatched-pattern"],
            command: "oxfmt",
            cwd: "/project",
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

        yield* runCommand(checkCommand, [], { layers: [runner.layer, oxlintInstalledLayer] })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--deny-warnings"],
          })
        )
      })
    )

    it.effect("let Oxlint pass on warnings with --allow-warnings", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, ["--allow-warnings"], {
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({ ...OXLINT_COMMAND, args: [...OXLINT_COMMAND.args] })
        )
      })
    )

    it.effect("reject --allow-warnings with the format stage", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "format", "--allow-warnings"], {
          layers: [runner.layer, oxlintInstalledLayer],
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
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--deny-warnings"],
          })
        )
      })
    )

    it.effect("keep a forwarded --max-warnings threshold", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, [], {
          forwardedArguments: ["--max-warnings=5"],
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(runner.invocations).toContainEqual(
          expect.objectContaining({
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--max-warnings=5"],
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

        yield* runCommand(checkCommand, [], {
          layers: [runner.layer, oxlintInstalledLayer],
          logLines,
        })

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
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: ["--check", join(files.root, "index.ts")],
            command: "oxfmt",
            cwd: "/project",
            title: "✨ Checking formatting",
          },
          {
            ...OXLINT_COMMAND,
            args: [
              ...OXLINT_COMMAND.args,
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
    it.effect(
      "name the init command that adds check when the lockfile selects no script and Oxfmt is missing",
      () =>
        Effect.gen(function* () {
          const runner = makeHandoffRunner({ commandExits: { oxfmt: "not-found" } })

          const exit = yield* runCommand(checkCommand, [], {
            files: createFileSystemTestContext({ files: makeLockfileFile(makeSelection({})) }),
            layers: [runner.layer, oxlintInstalledLayer],
          })

          const error = getFailure(exit)

          expect(error).toStrictEqual(new ToolNotSelected({ script: "check", tool: "oxfmt" }))
          expect(error?.message).toBe(
            "The lockfile selects no script that runs `oxfmt`, so `oxfmt` is not installed. Run `adamantite init --non-interactive --script check` to add the script and install it."
          )
        })
    )

    // The CLI resolves the Oxlint runtime before it starts Oxlint, so the format stage still runs.
    // The CLI prints the failure that the check returns, so the missing Oxlint stays that failure
    // when the format stage fails too.
    it.effect.each([0, 1])(
      "check the formatting, then name the init command when the lockfile selects no script and Oxlint is missing, with Oxfmt exit %i",
      (formatExit) =>
        Effect.gen(function* () {
          const runner = createRunnerTestContext([formatExit])

          const exit = yield* runCommand(checkCommand, [], {
            files: createFileSystemTestContext({ files: makeLockfileFile(makeSelection({})) }),
            layers: [runner.layer],
          })

          const error = getFailure(exit)

          expect({
            error,
            ran: runner.invocations.map((invocation) => invocation.name ?? invocation.command),
          }).toStrictEqual({
            error: new ToolNotSelected({ script: "check", tool: "oxlint" }),
            ran: ["oxfmt"],
          })
          expect(error?.message).toBe(
            "The lockfile selects no script that runs `oxlint`, so `oxlint` is not installed. Run `adamantite init --non-interactive --script check` to add the script and install it."
          )
        })
    )

    it.effect(
      "run each stage when the lockfile selects no script and the tools are installed",
      () =>
        Effect.gen(function* () {
          const runner = createRunnerTestContext()

          const exit = yield* runCommand(checkCommand, [], {
            files: createFileSystemTestContext({ files: makeLockfileFile(makeSelection({})) }),
            layers: [runner.layer, oxlintInstalledLayer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(
            runner.invocations.map((invocation) => invocation.name ?? invocation.command)
          ).toStrictEqual(["oxfmt", "oxlint"])
        })
    )

    // `adamantite update` installs a selected tool, so its own failure stands.
    it.effect("keep the not-found failure of a tool that the lockfile selects", () =>
      Effect.gen(function* () {
        const runner = makeHandoffRunner({ commandExits: { oxfmt: "not-found" } })

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({
            files: makeLockfileFile(makeSelection({ presets: ["core"], scripts: ["check"] })),
          }),
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(getFailure(exit)).toStrictEqual(new CliNotFound({ command: "oxfmt" }))
      })
    )

    // Doctor reports the lockfile, and the tools fail as without a lockfile.
    it.effect("keep the not-found failure when the lockfile does not decode", () =>
      Effect.gen(function* () {
        const runner = makeHandoffRunner({ commandExits: { oxfmt: "not-found" } })

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({ files: { [LOCKFILE_PATH]: "<<<<<<< HEAD\n" } }),
          layers: [runner.layer, oxlintInstalledLayer],
        })

        expect(getFailure(exit)).toStrictEqual(new CliNotFound({ command: "oxfmt" }))
      })
    )
  })

  describe("error handling", () => {
    it.effect("run lint after formatting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2, 3])

        const exit = yield* runCommand(checkCommand, [], {
          layers: [runner.layer, oxlintInstalledLayer],
        })

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
