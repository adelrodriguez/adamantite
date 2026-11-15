import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import initCommand from "#commands/init/index.ts"
import updateCommand from "#commands/update.ts"
import { PACKAGE as knip } from "#lib/integrations/knip/index.ts"
import { PACKAGE as oxfmt } from "#lib/integrations/oxfmt/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/oxlint/config.ts"
import { PACKAGE as oxlint } from "#lib/integrations/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { FailedToInstallDependency, UnsupportedLockfile } from "#lib/shared/errors.ts"
import {
  createDependencyInstallerTestContext,
  createRunnerTestContext,
  hashContent,
  makeLockfileFile,
  readLockfile,
  runCommand,
} from "./command-test-helpers.ts"
import { makeSelection } from "./lifecycle.ts"

const effectTsgo = managedPlugin("@effect/tsgo")
const shadcnLint = managedPlugin("@shadcn/lint")

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

/**
 * A project with the effect preset where only Oxlint is off its pin.
 */
function makeEffectFiles(oxlintConfig: string) {
  return createFileSystemTestContext({
    files: {
      "oxlint.config.ts": oxlintConfig,
      "package.json": manifest({
        devDependencies: { "@effect/tsgo": effectTsgo.version, oxlint: "1.0.0" },
        scripts: { check: "adamantite check", prepare: "adamantite prepare" },
      }),
    },
  })
}

// A lockfile that a newer Adamantite version wrote.
// The setup that `init --script check` records.
const CHECK_SELECTION = makeSelection({ presets: ["core"], scripts: ["check"] })

const NEWER_LOCKFILE = JSON.stringify({ schemaVersion: 2, version: "9.0.0" })

describe("update", () => {
  it.effect(
    "record the selection that init would record, and the files that equal the current render, in a project without a lockfile",
    () =>
      Effect.gen(function* () {
        const initialized = createFileSystemTestContext({ files: { "package.json": manifest({}) } })
        const installer = createDependencyInstallerTestContext()

        const init = yield* runCommand(
          initCommand,
          [
            "--non-interactive",
            "--script",
            "check",
            "--script",
            "analyze",
            "--preset",
            "react",
            "--typescript",
            "typescript",
            "--editor",
            "vscode",
            "--github-actions",
            "--agents",
          ],
          { files: initialized, layers: [installer.layer] }
        )

        expect(Exit.isSuccess(init)).toBe(true)

        // The project as an earlier version left it: no lockfile, and a Knip config that the user
        // changed.
        const files = createFileSystemTestContext({
          files: Object.fromEntries(
            initialized
              .list()
              .filter((file) => file !== LOCKFILE_PATH)
              .map((file) => [file, initialized.read(file)])
          ),
        })

        files.write("knip.config.ts", `${files.read("knip.config.ts")}// Changed by the user.\n`)

        const exit = yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)

        const recorded = readLockfile(initialized)

        expect(recorded.written["knip.config.ts"]).toBe(
          hashContent(initialized.read("knip.config.ts"))
        )
        expect(readLockfile(files)).toStrictEqual({
          ...recorded,
          written: Object.fromEntries(
            Object.entries(recorded.written).filter(([file]) => file !== "knip.config.ts")
          ),
        })
      })
  )

  it.effect("report no changes when managed packages are current", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { knip: knip.version } }) },
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
      expect(logLines).toStrictEqual([
        "💠 adamantite update",
        "✅ No managed updates were applied.",
      ])
    })
  )

  it.effect("leave a package alone when its range resolves to the managed version", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { knip: `^${knip.version}` } }) },
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
    })
  )

  it.effect("leave a managed plugin alone when the config does not import its preset", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
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

  // The recorded selection runs Oxlint, so Setup installs the managed version.
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

      expect(Exit.isSuccess(exit)).toBe(true)
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
        detectedPackageManager: { name: "pnpm" },
      })

      yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

      expect(installer.calls.map((call) => call.options)).toContainEqual({
        silent: true,
        workspace: true,
      })
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

      const installer = createDependencyInstallerTestContext({
        addDevDependenciesError: new FailedToInstallDependency({ packages: ["oxlint"] }),
      })

      const exit = yield* runCommand(updateCommand, [], { files, layers: [installer.layer] })

      expect(Exit.isFailure(exit)).toBe(true)
    })
  )

  it.effect("keep findings informational", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
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

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite update",
        "● The project has no lockfile, so update records the setup that the project files show.",
        "● `analyze` script is up to date.",
        "✔ `.adamantite/adamantite-lock.json` written. Commit it with the setup.",
        // The lockfile selects no agent guidance, so Doctor checks no `AGENTS.md`.
        expect.stringMatching(/^\n1\. Legacy knip configuration\n/u),
        "● Run `adamantite doctor` for the remaining repairs and an agent prompt.",
        "✅ Update finished.",
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

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls[0]?.packages).toContain(`oxlint@${oxlint.version}`)
      expect(installer.calls[0]?.packages).not.toContain(`@effect/tsgo@${effectTsgo.version}`)
      expect(runner.invocations).toStrictEqual([])
    })
  )
})
