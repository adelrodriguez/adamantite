import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import updateCommand from "#commands/update.ts"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import { parseJson } from "#lib/shared/json.ts"
import {
  createDependencyInstallerTestContext,
  createRunnerTestContext,
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
        "● Packages to install or update:\n    knip: 5.0.0 → 6.45.1",
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
          "package.json": manifest({ devDependencies: { knip: "catalog:", oxfmt: "npm:oxfmt@1" } }),
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
        expect.stringMatching(/^▲ `oxfmt` is declared as `npm:oxfmt@1`/u),
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
        expect.stringMatching(/^\n1\. Missing knip configuration\n/u),
        expect.stringMatching(/^\n2\. Missing AGENTS\.md\n/u),
        "● Run `adamantite doctor` for the remaining repairs and an agent prompt.",
        "✅ Update finished.",
      ])
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
        "● Packages to install or update:\n    knip: 5.0.0 → 6.45.1",
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
        expect(yield* parseJson(files.read("skills-lock.json"))).toStrictEqual({
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
