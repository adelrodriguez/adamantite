import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import type { Selection } from "#lib/project/selection.ts"
import {
  ADAMANTITE_RESOLUTION,
  createRunnerTestContext,
  getFailure,
  getFailures,
  makeAdamantitePackageFile,
  makeLockfileFile,
  makeToolsInstalledLayer,
  OXFMT_CLI,
  OXLINT_COMMAND,
  toolsInstalledLayer,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection } from "#__tests__/lifecycle.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import checkCommand from "#commands/check.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import {
  CommandFailed,
  InvalidCheckOptions,
  PackageNotInstalled,
  SetupAhead,
  SetupOutdated,
  ToolNotSelected,
} from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

// The test project installs Oxfmt, Oxlint, and Adamantite.
const installedLayer = makeModuleResolverLayer("/project", {
  "oxfmt/package.json": "node_modules/oxfmt/package.json",
  "oxlint/package.json": "node_modules/oxlint/package.json",
  ...ADAMANTITE_RESOLUTION,
})

// The test project installs Adamantite and only `tool`.
function makeInstalledLayer(tool: "oxfmt" | "oxlint") {
  return makeModuleResolverLayer("/project", {
    [`${tool}/package.json`]: `node_modules/${tool}/package.json`,
    ...ADAMANTITE_RESOLUTION,
  })
}

// A project that installs Adamantite `installed`, with a lockfile that Adamantite `recorded` wrote
// when it names one.
function makeSetupFiles(options: { installed: string; recorded?: string; selection?: Selection }) {
  const files = createFileSystemTestContext({
    files: makeAdamantitePackageFile(options.installed),
  })

  if (options.recorded !== undefined) {
    const lockfile = makeLockfileFile(
      options.selection ?? makeSelection({ presets: ["core"], scripts: ["check"] }),
      {},
      options.recorded
    )

    files.write(LOCKFILE_PATH, lockfile[LOCKFILE_PATH])
  }

  return files
}

describe("check", () => {
  describe("stage flags", () => {
    it.effect("run only the lint stage when selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "lint"], {
          forwardedArguments: ["--format", "github"],
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            ...OXLINT_COMMAND,
            args: [...OXLINT_COMMAND.args, "--deny-warnings", "--format", "github"],
          },
        ])
      })
    )

    it.effect("run only the format stage when selected and forward arguments to it", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--only", "format"], {
          forwardedArguments: ["--no-error-on-unmatched-pattern"],
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: [OXFMT_CLI, "--check", "--no-error-on-unmatched-pattern"],
            command: "node",
            cwd: "/project",
            name: "oxfmt",
          },
        ])
      })
    )
  })

  describe("warnings", () => {
    it.effect("make Oxlint fail on warnings", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        yield* runCommand(checkCommand, [], { layers: [runner.layer, toolsInstalledLayer] })

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
          layers: [runner.layer, toolsInstalledLayer],
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
          layers: [runner.layer, toolsInstalledLayer],
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
          layers: [runner.layer, toolsInstalledLayer],
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
          layers: [runner.layer, toolsInstalledLayer],
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
          layers: [runner.layer, toolsInstalledLayer],
          logLines,
        })

        expect(logLines.map((line) => stripVTControlCharacters(String(line)))).toStrictEqual([
          "✨ Checking formatting · adamantite (oxfmt)",
          "",
          "🔍 Linting · adamantite (oxlint)",
        ])
      })
    )

    it.effect("print a heading before each tool for the files that the user names", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })

        const runner = createRunnerTestContext()
        const logLines: unknown[] = []

        yield* runCommand(checkCommand, ["index.ts"], {
          files,
          layers: [runner.layer, toolsInstalledLayer],
          logLines,
        })

        expect(logLines.map((line) => stripVTControlCharacters(String(line)))).toStrictEqual([
          "✨ Checking formatting · adamantite (oxfmt)",
          "",
          "🔍 Linting · adamantite (oxlint)",
        ])
      })
    )

    // A heading is for a person who reads the stages of a plain run. With `--only` or forwarded
    // arguments, the output is the tool's own, such as `--format json` that a script parses. An
    // agent reads Oxlint's agent report, which prints nothing for a passing lint, so a heading
    // would end the output with no result.
    it.effect.each<{
      readonly args: readonly string[]
      readonly env: Readonly<Record<string, string>>
      readonly forwardedArguments: readonly string[]
      readonly name: string
    }>([
      { args: ["--only", "lint"], env: {}, forwardedArguments: [], name: "with --only lint" },
      { args: ["--only", "format"], env: {}, forwardedArguments: [], name: "with --only format" },
      {
        args: [],
        env: {},
        forwardedArguments: ["--format", "json"],
        name: "with forwarded arguments",
      },
      {
        args: [],
        env: { CLAUDECODE: "1" },
        forwardedArguments: [],
        name: "when Oxlint prints its agent report",
      },
    ])("print no heading $name", ({ args, env, forwardedArguments }) =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        const logLines: unknown[] = []

        const exit = yield* runCommand(checkCommand, args, {
          env,
          forwardedArguments,
          layers: [runner.layer, toolsInstalledLayer],
          logLines,
        })

        expect({ logLines, success: Exit.isSuccess(exit) }).toStrictEqual({
          logLines: [],
          success: true,
        })
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
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          {
            args: [OXFMT_CLI, "--check", join(files.root, "index.ts")],
            command: "node",
            cwd: "/project",
            name: "oxfmt",
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

          const exit = yield* runCommand(checkCommand, [], {
            files: createFileSystemTestContext({ files: makeLockfileFile(makeSelection({})) }),
            layers: [runner.layer, makeToolsInstalledLayer("oxlint")],
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
            layers: [runner.layer, makeToolsInstalledLayer("oxfmt")],
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
            layers: [runner.layer, toolsInstalledLayer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(
            runner.invocations.map((invocation) => invocation.name ?? invocation.command)
          ).toStrictEqual(["oxfmt", "oxlint"])
        })
    )

    // `adamantite update` installs a selected tool, so its own failure stands.
    it.effect("keep the missing-package failure of a tool that the lockfile selects", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({
            files: makeLockfileFile(makeSelection({ presets: ["core"], scripts: ["check"] })),
          }),
          layers: [runner.layer, makeToolsInstalledLayer("oxlint")],
        })

        expect(getFailure(exit)).toStrictEqual(
          new PackageNotInstalled({ packageName: "oxfmt", project: "/project" })
        )
      })
    )

    // Doctor reports the lockfile, and the tools fail as without a lockfile.
    it.effect("keep the missing-package failure when the lockfile does not decode", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], {
          files: createFileSystemTestContext({ files: { [LOCKFILE_PATH]: "<<<<<<< HEAD\n" } }),
          layers: [runner.layer, makeToolsInstalledLayer("oxlint")],
        })

        expect(getFailure(exit)).toStrictEqual(
          new PackageNotInstalled({ packageName: "oxfmt", project: "/project" })
        )
      })
    )
  })

  describe("error handling", () => {
    it.effect("run lint after formatting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2, 3])

        const exit = yield* runCommand(checkCommand, [], {
          layers: [runner.layer, toolsInstalledLayer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(CommandFailed)
        expect(error).toMatchObject({ command: "node", exitCode: 2 })
        expect(
          runner.invocations.map((invocation) => invocation.name ?? invocation.command)
        ).toStrictEqual(["oxfmt", "oxlint"])
      })
    )
  })

  describe("setup version", () => {
    it.effect(
      "run both stages, then fail with the outdated setup when an older Adamantite wrote the lockfile",
      () =>
        Effect.gen(function* () {
          const runner = createRunnerTestContext()
          const logLines: unknown[] = []

          const exit = yield* runCommand(checkCommand, [], {
            files: makeSetupFiles({ installed: "0.47.0", recorded: "0.46.0" }),
            layers: [runner.layer, installedLayer],
            logLines,
          })

          const error = getFailure(exit)

          expect({
            error,
            headings: logLines.map((line) => stripVTControlCharacters(String(line))),
          }).toStrictEqual({
            error: new SetupOutdated({
              installed: "0.47.0",
              path: LOCKFILE_PATH,
              recorded: "0.46.0",
            }),
            headings: [
              "✨ Checking formatting · adamantite (oxfmt)",
              "",
              "🔍 Linting · adamantite (oxlint)",
            ],
          })
          expect(error?.message).toBe(
            "`.adamantite/adamantite-lock.json` records the setup of Adamantite 0.46.0, but the project installs Adamantite 0.47.0. Run the project's installed `adamantite update` through its package runner, such as `pnpm exec adamantite update`, to update the managed packages, files, and skill, commit the changes, and run `adamantite check` again."
          )
        })
    )

    // A failed stage already printed its report, so the last line names the setup repair.
    const OUTDATED = new SetupOutdated({
      installed: "0.47.0",
      path: LOCKFILE_PATH,
      recorded: "0.46.0",
    })

    // The CLI prints each error after the stage reports, in this order, so the agent reads why a
    // stage did not run, then the setup repair. The first error decides the exit code.
    it.effect.each([
      {
        args: [],
        error: new CommandFailed({ command: "node", exitCode: ChildProcessSpawner.ExitCode(1) }),
        layer: installedLayer,
        name: "a stage that printed its report",
        runner: createRunnerTestContext([1, 0]),
        selection: undefined,
      },
      {
        args: ["--only", "format", "--allow-warnings"],
        error: new InvalidCheckOptions({
          reason: "`--allow-warnings` applies to the lint stage. Remove it or `--only format`.",
        }),
        layer: installedLayer,
        name: "invalid options",
        runner: createRunnerTestContext(),
        selection: undefined,
      },
      {
        args: [],
        error: new PackageNotInstalled({ packageName: "oxlint", project: "/project" }),
        layer: makeInstalledLayer("oxfmt"),
        name: "an Oxlint that is not installed",
        runner: createRunnerTestContext(),
        selection: undefined,
      },
      {
        args: [],
        error: new PackageNotInstalled({ packageName: "oxfmt", project: "/project" }),
        layer: makeInstalledLayer("oxlint"),
        name: "an Oxfmt that is not installed",
        runner: createRunnerTestContext(),
        selection: undefined,
      },
      {
        args: [],
        error: new ToolNotSelected({ script: "check", tool: "oxfmt" }),
        layer: makeInstalledLayer("oxlint"),
        name: "a tool that the lockfile does not select",
        runner: createRunnerTestContext(),
        selection: makeSelection({}),
      },
    ])(
      "fail with the stage error, then the outdated setup, after $name",
      ({ args, error, layer, runner, selection }) =>
        Effect.gen(function* () {
          const exit = yield* runCommand(checkCommand, args, {
            files: makeSetupFiles({ installed: "0.47.0", recorded: "0.46.0", selection }),
            layers: [runner.layer, layer],
          })

          expect(getFailures(exit)).toStrictEqual([error, OUTDATED])
        })
    )

    it.effect(
      "fail with the newer setup, and name the install, when a newer Adamantite wrote the lockfile",
      () =>
        Effect.gen(function* () {
          const runner = createRunnerTestContext()

          const exit = yield* runCommand(checkCommand, [], {
            files: makeSetupFiles({ installed: "0.47.0", recorded: "0.48.0" }),
            layers: [runner.layer, installedLayer],
          })

          const error = getFailure(exit)

          expect(error).toStrictEqual(
            new SetupAhead({ installed: "0.47.0", path: LOCKFILE_PATH, recorded: "0.48.0" })
          )
          expect(error?.message).toBe(
            "`.adamantite/adamantite-lock.json` records the setup of Adamantite 0.48.0, but the project installs the older Adamantite 0.47.0. Install the dependencies, or update the project's `adamantite` dependency to 0.48.0 or newer, and run `adamantite check` again."
          )
        })
    )

    it.effect.each([
      { name: "the running Adamantite wrote the lockfile", recorded: getPackageVersion() },
      { name: "the project has no lockfile", recorded: undefined },
    ])("pass when $name", ({ recorded }) =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], {
          files: makeSetupFiles({ installed: getPackageVersion(), recorded }),
          layers: [runner.layer, installedLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
      })
    )

    // A CLI from another install, such as `npx adamantite@latest check`, judges the project as the
    // project's own CLI does.
    it.effect("pass when the installed Adamantite wrote the lockfile and another one runs", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        expect(getPackageVersion()).not.toBe("0.1.0")

        const exit = yield* runCommand(checkCommand, [], {
          files: makeSetupFiles({ installed: "0.1.0", recorded: "0.1.0" }),
          layers: [runner.layer, installedLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
      })
    )

    // Doctor reports the lockfile, and the stages run as without a lockfile.
    it.effect("pass when the lockfile does not decode", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        const files = makeSetupFiles({ installed: "0.47.0" })

        files.write(LOCKFILE_PATH, "<<<<<<< HEAD\n")

        const exit = yield* runCommand(checkCommand, [], {
          files,
          layers: [runner.layer, installedLayer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
      })
    )
  })
})
