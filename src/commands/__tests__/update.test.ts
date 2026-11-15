import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { decodeJson } from "#__tests__/json.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import initCommand from "#commands/init/index.ts"
import updateCommand from "#commands/update.ts"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { FailedToInstallDependency, UnsupportedLockfile } from "#lib/shared/errors.ts"
import {
  createDependencyInstallerTestContext,
  createRunnerTestContext,
  hashContent,
  readLockfile,
  runCommand,
} from "./command-test-helpers.ts"

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
const NEWER_LOCKFILE = JSON.stringify({ schemaVersion: 2, version: "9.0.0" })

const shippedSkill = getShippedSkillFiles()

/**
 * The shipped skill as test fixture files in the skill folder.
 */
function makeSkillCopy(folder: string, skill: Record<string, string> = shippedSkill) {
  return Object.fromEntries(
    Object.entries(skill).map(([file, content]) => [`${folder}/adamantite/${file}`, content])
  )
}

function makeSkillsLock(skills: Record<string, string>): string {
  return JSON.stringify({
    skills: Object.fromEntries(
      Object.entries(skills).map(([name, source]) => [name, { source, sourceType: "local" }])
    ),
    version: 1,
  })
}

function makeSkillFiles(files: Record<string, string>) {
  return createFileSystemTestContext({
    files: {
      "package.json": manifest({ devDependencies: { knip: knip.version } }),
      ...files,
    },
  })
}

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

  it.effect("leave the adamantite package itself untouched", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({ devDependencies: { adamantite: "0.0.1", knip: "5.0.0" } }),
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
      expect(installer.calls).toHaveLength(1)
      expect(installer.calls[0]?.packages).toStrictEqual([`knip@${knip.version}`])
      expect(logLines).toStrictEqual([
        "💠 adamantite update",
        "● Packages to install or update:\n  knip: 5.0.0 → 6.45.1",
        "✔ Dependencies updated.",
        "✅ Update finished.",
      ])
    })
  )

  it.effect("update at the workspace root in a monorepo", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { knip: "5.0.0" },
            workspaces: ["packages/*"],
          }),
        },
      })

      const logLines: unknown[] = []

      const installer = createDependencyInstallerTestContext({
        detectedPackageManager: { name: "pnpm" },
      })

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [installer.layer],
        logLines,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls[0]?.options).toStrictEqual({ silent: true, workspace: true })
    })
  )

  it.effect("report an outdated catalog entry of a known package without installing it", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({ devDependencies: { knip: "catalog:", sherif: "npm:sherif@1" } }),
          "pnpm-workspace.yaml": "catalog:\n  knip: 0.0.1\n",
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
      expect(logLines).toStrictEqual([
        "💠 adamantite update",
        expect.stringMatching(/^▲ `sherif` is declared as `npm:sherif@1`/u),
        expect.stringMatching(/^\n1\. Outdated knip\n/u),
        "● Run `adamantite doctor` for the remaining repairs and an agent prompt.",
        "✅ Update finished.",
      ])
    })
  )

  it.effect("keep findings informational", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: {
          "package.json": manifest({
            devDependencies: { knip: knip.version },
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
        "✔ `.adamantite/adamantite-lock.json` written with the setup that the project files show. Commit it.",
        // The lockfile selects no agent guidance, so Doctor checks no `AGENTS.md`.
        expect.stringMatching(/^\n1\. Missing knip configuration\n/u),
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

  it.effect("fail when dependency installation fails", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { knip: "5.0.0" } }) },
      })

      const logLines: unknown[] = []

      const installer = createDependencyInstallerTestContext({
        addDevDependenciesError: new FailedToInstallDependency({ packages: ["knip"] }),
      })

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [installer.layer],
        logLines,
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(logLines).toStrictEqual([
        "💠 adamantite update",
        "● Packages to install or update:\n  knip: 5.0.0 → 6.45.1",
        "❌ Update failed",
      ])
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

  describe("Adamantite skill", () => {
    it.effect("refresh a copy when only a reference guide differs from the shipped skill", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          ...makeSkillCopy(".claude/skills", {
            ...shippedSkill,
            "references/removed.md": "# A guide that the shipped skill no longer has\n",
            "references/setup.md": "# An older setup guide\n",
          }),
        })

        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [installer.layer],
          logLines,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.list().filter((file) => file.startsWith(".claude/"))).toStrictEqual(
          Object.keys(makeSkillCopy(".claude/skills"))
        )
        expect(files.read(".claude/skills/adamantite/references/setup.md")).toBe(
          shippedSkill["references/setup.md"]
        )
        // A folder without the skill stays without it.
        expect(files.exists(".agents/skills/adamantite")).toBe(false)
        expect(logLines).toStrictEqual([
          "💠 adamantite update",
          "✔ Adamantite skill refreshed.",
          "✅ Update finished.",
        ])
      })
    )

    it.effect("leave a copy alone when it matches the shipped skill", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles(makeSkillCopy(".agents/skills"))
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
          "✅ No managed updates were applied.",
        ])
      })
    )

    it.effect("delete the skills lock when the adamantite entry was its only entry", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          ...makeSkillCopy(".agents/skills"),
          "skills-lock.json": makeSkillsLock({ adamantite: "./node_modules/adamantite" }),
        })

        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [installer.layer],
          logLines,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists("skills-lock.json")).toBe(false)
        expect(logLines).toStrictEqual([
          "💠 adamantite update",
          "● Removed the `adamantite` entry from `skills-lock.json`.",
          "✅ Update finished.",
        ])
      })
    )

    it.effect("keep the other entries of the skills lock", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          "skills-lock.json": makeSkillsLock({
            adamantite: "./node_modules/adamantite",
            other: "someone/other",
          }),
        })

        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [installer.layer],
          logLines,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* decodeJson(files.read("skills-lock.json"))).toStrictEqual({
          skills: { other: { source: "someone/other", sourceType: "local" } },
          version: 1,
        })
      })
    )

    it.effect("warn and report no applied updates when the skills lock cannot be parsed", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({ "skills-lock.json": "{ invalid" })
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
          expect.stringMatching(/^▲ Could not update `skills-lock\.json`\. Failed to parse /u),
          "✅ No managed updates were applied.",
        ])
      })
    )

    it.effect("warn and finish the update when the skills lock cannot be written", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          "skills-lock.json": makeSkillsLock({
            adamantite: "./node_modules/adamantite",
            other: "someone/other",
          }),
        })

        files.makeReadOnly("skills-lock.json")
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
          expect.stringMatching(/^▲ Could not update `skills-lock\.json`\. Could not write /u),
          "✅ Update finished.",
        ])
      })
    )

    it.effect("warn and finish the update when the refresh fails", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles(
          makeSkillCopy(".claude/skills", { ...shippedSkill, "SKILL.md": "# Adamantite 1\n" })
        )

        files.makeReadOnly(".claude/skills/adamantite/SKILL.md")
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
          expect.stringMatching(/^▲ Could not refresh the Adamantite skill\. /u),
          "✅ Update finished.",
        ])
      })
    )
  })
})
