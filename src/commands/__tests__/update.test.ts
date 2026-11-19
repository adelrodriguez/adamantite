import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  ADAMANTITE_RESOLUTION,
  createDependencyInstallerTestContext,
  createRunnerTestContext,
  findingsLeft,
  getFailure,
  makeAdamantitePackageFile,
  makeHandoffRunner,
  makeLockfileFile,
  nonProbeInvocations,
  promptingLayer,
  readLockfile,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection } from "#__tests__/lifecycle.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { createTerminalTestContext } from "#__tests__/terminal.ts"
import checkCommand from "#commands/check.ts"
import doctorCommand from "#commands/doctor.ts"
import { Report } from "#commands/setup.ts"
import updateCommand from "#commands/update.ts"
import { PACKAGE as knip } from "#lib/integrations/knip/index.ts"
import { PACKAGE as oxfmt } from "#lib/integrations/oxfmt/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/oxlint/config.ts"
import { PACKAGE as oxlint } from "#lib/integrations/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import * as Setup from "#lib/setup/index.ts"
import { FailedToInstallDependency, UnsupportedLockfile } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const effectTsgo = managedPlugin("@effect/tsgo")
const shadcnLint = managedPlugin("@shadcn/lint")

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

function makeEffectFiles(oxlintConfig: string) {
  return createFileSystemTestContext({
    files: {
      ...makeLockfileFile(makeSelection({ presets: ["core", "effect"], scripts: ["check"] })),
      "oxlint.config.ts": oxlintConfig,
      "package.json": manifest({
        devDependencies: { "@effect/tsgo": effectTsgo.version, oxlint: "1.0.0" },
        scripts: { check: "adamantite check", prepare: "adamantite prepare" },
      }),
    },
  })
}

const CHECK_SELECTION = makeSelection({ presets: ["core"], scripts: ["check"] })

const NEWER_LOCKFILE = JSON.stringify({ schemaVersion: 2, version: "9.0.0" })

// The changelog that the installed Adamantite 0.47.0 ships, newest release first.
const CHANGELOG = `# adamantite

## 0.47.0

### Minor Changes

- Rename the shadcn preset to tailwind

  To migrate, replace \`adamantite/lint/shadcn\` with \`adamantite/lint/tailwind\`.

## 0.46.1

### Patch Changes

- Fix a report of the layers rule

## 0.46.0

### Minor Changes

- Record the setup in a lockfile
`

/**
 * Runs update with `args` in a project that Adamantite 0.46.0 set up, with nothing selected, after
 * the project installed Adamantite 0.47.0 and its changelog.
 */
function runUpgrade(args: readonly string[], options: { prompting?: boolean } = {}) {
  return Effect.gen(function* () {
    const files = createFileSystemTestContext({
      files: {
        ...makeLockfileFile(makeSelection({}), {}, "0.46.0"),
        ...makeAdamantitePackageFile("0.47.0"),
        "node_modules/adamantite/CHANGELOG.md": CHANGELOG,
        "package.json": manifest({ devDependencies: { adamantite: "0.47.0" } }),
      },
    })

    const logLines: unknown[] = []
    const errorLines: unknown[] = []

    const exit = yield* runCommand(updateCommand, args, {
      errorLines,
      files,
      layers: [
        createDependencyInstallerTestContext().layer,
        makeModuleResolverLayer("/project", ADAMANTITE_RESOLUTION),
        ...(options.prompting === true ? [promptingLayer] : []),
      ],
      logLines,
    })

    return { errorLines, exit, logLines }
  })
}

describe("update", () => {
  describe("release notes", () => {
    it.effect("print the notes of each release since the recorded version as Markdown", () =>
      Effect.gen(function* () {
        const { exit, logLines } = yield* runUpgrade([])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(logLines).toStrictEqual([
          "✔ `.adamantite/adamantite-lock.json` updated. Commit it.",
          [
            "# Adamantite release notes since 0.46.0",
            "",
            "These notes come from `node_modules/adamantite/CHANGELOG.md`, oldest release first. Follow each migration step that applies to this project.",
            "",
            "## 0.46.1",
            "",
            "### Patch Changes",
            "",
            "- Fix a report of the layers rule",
            "",
            "## 0.47.0",
            "",
            "### Minor Changes",
            "",
            "- Rename the shadcn preset to tailwind",
            "",
            "  To migrate, replace `adamantite/lint/shadcn` with `adamantite/lint/tailwind`.",
          ].join("\n"),
        ])
      })
    )

    it.effect("link each release since the recorded version in a terminal", () =>
      Effect.gen(function* () {
        const { exit, logLines } = yield* runUpgrade([], { prompting: true })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(logLines).toStrictEqual([
          "💠 adamantite update",
          "✔ `.adamantite/adamantite-lock.json` updated. Commit it.",
          "● Adamantite 0.46.1 release notes: https://github.com/adelrodriguez/adamantite/releases/tag/v0.46.1",
          "● Adamantite 0.47.0 release notes: https://github.com/adelrodriguez/adamantite/releases/tag/v0.47.0",
          "✅ Update finished.",
        ])
      })
    )

    it.effect("put the notes in the JSON document", () =>
      Effect.gen(function* () {
        const { errorLines, exit, logLines } = yield* runUpgrade(["--json"])
        const report = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Report))(logLines[0])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect({
          errorLines,
          lines: logLines.length,
          releaseNotes: report.releaseNotes,
        }).toStrictEqual({
          errorLines: ["✔ `.adamantite/adamantite-lock.json` updated. Commit it."],
          lines: 1,
          releaseNotes: {
            changelog: "node_modules/adamantite/CHANGELOG.md",
            from: "0.46.0",
            releases: [
              {
                notes: "### Patch Changes\n\n- Fix a report of the layers rule",
                version: "0.46.1",
              },
              {
                notes:
                  "### Minor Changes\n\n- Rename the shadcn preset to tailwind\n\n  To migrate, replace `adamantite/lint/shadcn` with `adamantite/lint/tailwind`.",
                version: "0.47.0",
              },
            ],
          },
        })
      })
    )
  })

  it.effect("set up nothing without a lockfile, and report the finding that names init", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0" },
            scripts: { check: "adamantite check" },
          }),
        },
      })

      const before = files.list()
      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, ["--json"], {
        files,
        layers: [installer.layer],
        logLines,
      })

      const report = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Report))(logLines[0])

      expect({
        failure: getFailure(exit),
        files: files.list(),
        findings: report.assessment.findings.map(({ goal, id }) => ({ goal: goal[0], id })),
        installs: installer.calls,
        setup: report.setup,
      }).toStrictEqual({
        failure: findingsLeft("update"),
        files: before,
        findings: [
          {
            goal: `Run \`adamantite init\`. It sets up the project and writes \`${LOCKFILE_PATH}\`.`,
            id: "lockfile-missing",
          },
        ],
        installs: [],
        setup: null,
      })
    })
  )

  it.effect("change nothing when the lockfile selects nothing", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(makeSelection({})),
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: knip.version },
          }),
        },
      })

      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [installer.layer],
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toStrictEqual([])
      expect(logLines).toStrictEqual(["✔ `.adamantite/adamantite-lock.json` updated. Commit it."])
    })
  )

  it.effect(
    "record the installed version when only the version differs, so doctor and check pass",
    () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ...makeLockfileFile(makeSelection({}), {}, "0.46.0"),
            ...makeAdamantitePackageFile(getPackageVersion()),
            "package.json": manifest({ devDependencies: { adamantite: getPackageVersion() } }),
          },
        })

        const installed = makeModuleResolverLayer("/project", ADAMANTITE_RESOLUTION)

        const withTools = makeModuleResolverLayer("/project", {
          "oxfmt/package.json": "node_modules/oxfmt/package.json",
          "oxlint/package.json": "node_modules/oxlint/package.json",
          ...ADAMANTITE_RESOLUTION,
        })

        const outdated = yield* runCommand(checkCommand, [], {
          files,
          layers: [createRunnerTestContext().layer, withTools],
        })

        const before = files.list()
        const updateLines: unknown[] = []

        const update = yield* runCommand(updateCommand, [], {
          files,
          layers: [createDependencyInstallerTestContext().layer, installed],
          logLines: updateLines,
        })

        const doctorLines: unknown[] = []

        const doctor = yield* runCommand(doctorCommand, [], {
          files,
          layers: [installed],
          logLines: doctorLines,
        })

        const check = yield* runCommand(checkCommand, [], {
          files,
          layers: [createRunnerTestContext().layer, withTools],
        })

        expect({
          check: Exit.isSuccess(check),
          doctor: { lines: doctorLines, success: Exit.isSuccess(doctor) },
          files: files.list(),
          outdated: getFailure(outdated)?._tag,
          update: { lines: updateLines, success: Exit.isSuccess(update) },
          version: readLockfile(files).version,
        }).toStrictEqual({
          check: true,
          doctor: { lines: [], success: true },
          files: before,
          outdated: "SetupOutdated",
          update: {
            lines: ["✔ `.adamantite/adamantite-lock.json` updated. Commit it."],
            success: true,
          },
          version: getPackageVersion(),
        })
      })
  )

  it.effect("leave a package alone when its range resolves to the managed version", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(makeSelection({ scripts: ["analyze"] })),
          "package.json": manifest({
            devDependencies: { adamantite: "1.0.0", knip: `^${knip.version}` },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })

      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, ["--json"], {
        files,
        layers: [installer.layer],
        logLines,
      })

      const report = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Report))(logLines[0])

      expect({
        calls: installer.calls,
        succeeded: Exit.isSuccess(exit),
        warnings: report.assessment.warnings,
      }).toStrictEqual({ calls: [], succeeded: true, warnings: [] })
    })
  )

  it.effect("leave a managed plugin alone when the config does not import its preset", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(makeSelection({ presets: ["core", "react"], scripts: ["check"] })),
          "oxlint.config.ts": toOxlintTsConfigContent(["react"]),
          "package.json": manifest({
            devDependencies: { "@shadcn/lint": "0.1.0" },
            scripts: { check: "adamantite check" },
          }),
        },
      })

      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      yield* runCommand(updateCommand, [], { files, layers: [installer.layer], logLines })

      expect(installer.calls.flatMap((call) => call.packages)).not.toContain(
        `@shadcn/lint@${shadcnLint.version}`
      )
    })
  )

  it.effect.each(managedPlugins)("update $name when the config imports its preset", (plugin) =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(
            makeSelection({ presets: ["core", plugin.preset], scripts: ["check"] })
          ),
          "oxlint.config.ts": toOxlintTsConfigContent([plugin.preset]),
          "package.json": manifest({
            devDependencies: { [plugin.name]: "0.1.0" },
            scripts: { check: "adamantite check" },
          }),
        },
      })

      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      yield* runCommand(updateCommand, [], { files, layers: [installer.layer], logLines })

      expect(installer.calls.flatMap((call) => call.packages)).toContain(
        `${plugin.name}@${plugin.version}`
      )
    })
  )

  it.effect("install an outdated managed package, and leave the adamantite package alone", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(CHECK_SELECTION),
          "package.json": manifest({
            devDependencies: {
              adamantite: "0.0.1",
              oxfmt: oxfmt.version,
              oxlint: "1.0.0",
              tsrs: tsrs.version,
            },
          }),
        },
      })

      const installer = createDependencyInstallerTestContext()
      const exit = yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

      expect(getFailure(exit)).toStrictEqual(findingsLeft("update"))
      expect(installer.calls.map((call) => call.packages)).toStrictEqual([
        [`oxlint@${oxlint.version}`],
      ])
    })
  )

  it.effect("install at the workspace root in a monorepo", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(CHECK_SELECTION),
          "package.json": manifest({ workspaces: ["packages/*"] }),
        },
      })

      const installer = createDependencyInstallerTestContext({
        detectedPackageManager: Option.some({ name: "pnpm" }),
      })

      yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

      expect(installer.calls.map((call) => call.options)).toContainEqual({ workspace: true })
    })
  )

  // `pnpm add` would replace the `catalog:` specifier, so the catalog entry stays a finding.
  it.effect("report an outdated catalog entry of a managed package without installing it", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(CHECK_SELECTION),
          "package.json": manifest({
            devDependencies: { oxfmt: oxfmt.version, oxlint: "catalog:", tsrs: tsrs.version },
          }),
          "pnpm-workspace.yaml": "catalog:\n  oxlint: 0.0.1\n",
        },
      })

      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()
      yield* runCommand(updateCommand, [], { files, layers: [installer.layer], logLines })

      expect(installer.calls.flatMap((call) => call.packages)).not.toContain(
        `oxlint@${oxlint.version}`
      )
      expect(logLines.join("\n")).toContain("Outdated oxlint")
    })
  )

  it.effect("fail when dependency installation fails", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { ...makeLockfileFile(CHECK_SELECTION), "package.json": manifest({}) },
      })

      const error = new FailedToInstallDependency({ packages: ["oxlint"] })
      const installer = createDependencyInstallerTestContext({ addDevDependenciesError: error })

      const exit = yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

      expect(getFailure(exit)).toBe(error)
    })
  )

  it.effect("exit 1 and print the repair prompt when findings remain after the setup", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(makeSelection({ scripts: ["analyze"] })),
          // Knip loads the JSON config before `knip.config.ts`, so update writes no config.
          "knip.json": "{}\n",
          "package.json": manifest({
            devDependencies: { adamantite: "0.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })

      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [installer.layer],
        logLines,
      })

      expect(getFailure(exit)).toStrictEqual(findingsLeft("update"))
      expect(logLines).toStrictEqual([
        "● `analyze` script is up to date.",
        "✔ `.adamantite/adamantite-lock.json` updated. Commit it.",
        expect.stringMatching(
          /^# Adamantite doctor findings\n[\s\S]*## 1\. Conflicting knip configuration\n/u
        ),
      ])
    })
  )

  it.effect("fail without writing a lockfile that a newer Adamantite version wrote", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          [LOCKFILE_PATH]: NEWER_LOCKFILE,
          "package.json": manifest({ devDependencies: { knip: knip.version } }),
        },
      })

      const exit = yield* runCommand(updateCommand, [], { files })

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toStrictEqual(
        new UnsupportedLockfile({
          path: LOCKFILE_PATH,
          schemaVersion: 2,
          version: Option.some("9.0.0"),
        })
      )
      expect(files.read(LOCKFILE_PATH)).toBe(NEWER_LOCKFILE)
    })
  )

  it.effect("update the effect preset's tools and run no patch", () =>
    Effect.gen(function* () {
      const files = makeEffectFiles(toOxlintTsConfigContent(["effect"]))
      const logLines: unknown[] = []
      const installer = createDependencyInstallerTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [installer.layer, runner.layer],
        logLines,
      })

      expect(getFailure(exit)).toStrictEqual(findingsLeft("update"))
      expect(installer.calls[0]?.packages).toContain(`oxlint@${oxlint.version}`)
      expect(installer.calls[0]?.packages).not.toContain(`@effect/tsgo@${effectTsgo.version}`)
      expect(runner.invocations).toStrictEqual([])
    })
  )

  it.effect(
    "hand the findings off after the setup, and succeed when the session resolves them",
    () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: {
            ...makeLockfileFile(makeSelection({ typescript: "tsconfig" })),
            "package.json": manifest({ devDependencies: { adamantite: "1.0.0" } }),
            "tsconfig.json": '{ "compilerOptions": { "strict": true } }\n',
          },
        })

        const logLines: unknown[] = []

        const runner = makeHandoffRunner({
          onAgentRun: () => {
            files.write("tsconfig.json", '{ "extends": "adamantite/tsconfig" }\n')
          },
        })

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [createDependencyInstallerTestContext().layer, runner.layer, promptingLayer],
          logLines,
          terminal: createTerminalTestContext(["enter"]),
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(nonProbeInvocations(runner).map(({ command }) => command)).toStrictEqual(["claude"])
        expect(logLines.slice(-3)).toStrictEqual([
          "● Handing the terminal to Claude Code. Exit the agent to return to Update.",
          "✔ Nothing remains to resolve after the Claude Code session.",
          "✅ Update finished.",
        ])
      })
  )

  it.effect("print the setup and the findings as JSON that decodes with the report schema", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          ...makeLockfileFile(makeSelection({ scripts: ["analyze"] })),
          // Knip loads the JSON config before `knip.config.ts`, so update writes no config.
          "knip.json": "{}\n",
          "package.json": manifest({
            devDependencies: { adamantite: "0.0.0", knip: knip.version },
            scripts: { analyze: "adamantite analyze" },
          }),
        },
      })

      const logLines: unknown[] = []
      const errorLines: unknown[] = []

      const exit = yield* runCommand(updateCommand, ["--json"], {
        errorLines,
        files,
        layers: [createDependencyInstallerTestContext().layer, promptingLayer],
        logLines,
      })

      const report = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Report))(logLines[0])

      expect(getFailure(exit)).toStrictEqual(findingsLeft("update"))
      expect({
        findings: report.assessment.findings.map(({ id }) => id),
        lines: logLines.length,
        setup: report.setup,
      }).toStrictEqual({
        findings: ["conflicting-knip-config"],
        lines: 1,
        setup: {
          files: [],
          installs: [],
          lockfile: "written",
          scripts: [Setup.ScriptWrite.cases.Unchanged.make({ script: "analyze" })],
        },
      })
      expect(errorLines).toContain("✔ `.adamantite/adamantite-lock.json` updated. Commit it.")
    })
  )
})
