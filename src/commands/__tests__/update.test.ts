import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import updateCommand from "#commands/update.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
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

function makeSkillsLock(source: string): string {
  return JSON.stringify({ skills: { adamantite: { source, sourceType: "local" } }, version: 1 })
}

function makeSkillFiles(files: Record<string, string>) {
  return createFileSystemTestContext({
    files: {
      "node_modules/adamantite/skills/adamantite/SKILL.md": "# Adamantite 2\n",
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
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toStrictEqual([])
      expect(prompter.outros).toStrictEqual([
        "✅ Managed packages and the Adamantite skill are up to date.",
      ])
    })
  )

  it.effect("leave a package alone when its range resolves to the managed version", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { knip: `^${knip.version}` } }) },
      })
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
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
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      yield* runCommand(updateCommand, [], { files, layers: [prompter.layer, installer.layer] })

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
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      yield* runCommand(updateCommand, [], { files, layers: [prompter.layer, installer.layer] })

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
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toHaveLength(1)
      expect(installer.calls[0]?.packages).toStrictEqual([`knip@${knip.version}`])
      expect(prompter.outros).toStrictEqual(["✅ Update finished."])
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
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext({
        detectedPackageManager: { name: "pnpm" },
      })

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls[0]?.options).toStrictEqual({ silent: true, workspace: true })
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
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.notes).toContainEqual(
        expect.objectContaining({ title: "1. Missing knip configuration" })
      )
      expect(prompter.logs).toContainEqual({
        level: "info",
        message: "Run `adamantite doctor` for the remaining repairs and an agent prompt.",
      })
    })
  )

  it.effect("fail when dependency installation fails", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { knip: "5.0.0" } }) },
      })
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext({
        addDevDependenciesError: new FailedToInstallDependency({ packages: ["knip"] }),
      })

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.outros).toStrictEqual(["❌ Update failed"])
    })
  )

  it.effect("update the effect preset's tools and run no patch", () =>
    Effect.gen(function* () {
      const files = makeEffectFiles(toOxlintTsConfigContent(["effect"]))
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls[0]?.packages).toContain(`oxlint@${oxlint.version}`)
      expect(installer.calls[0]?.packages).not.toContain(`@effect/tsgo@${effectTsgo.version}`)
      expect(runner.invocations).toStrictEqual([])
    })
  )

  describe("Adamantite skill", () => {
    it.effect("report no applied updates when the skill lock cannot be parsed", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({ "skills-lock.json": "{ invalid" })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toStrictEqual([])
        expect(prompter.logs).toContainEqual(expect.objectContaining({
          level: "warning",
          message: expect.stringContaining("Could not check the Adamantite skill."),
        }))
        expect(prompter.outros).toStrictEqual(["✅ No managed updates were applied."])
      })
    )

    it.effect("refresh a copy that init installed when it differs from the shipped skill", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          ".agents/skills/adamantite/SKILL.md": "# Adamantite 1\n",
          ".claude/skills/adamantite/SKILL.md": "# Adamantite 1\n",
          "skills-lock.json": makeSkillsLock("./node_modules/adamantite"),
        })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer, runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          expect.objectContaining({
            args: [
              "--yes",
              `skills@${getDependencyVersion("skills")}`,
              "add",
              "./node_modules/adamantite",
              "--skill",
              "adamantite",
              // Every agent that reads `.agents/skills` has the copy there.
              ...["claude-code", "codex", "cursor", "gemini-cli", "opencode"].flatMap((agent) => [
                "--agent",
                agent,
              ]),
              "--yes",
              "--json",
            ],
            command: "npx",
          }),
        ])
        expect(prompter.outros).toStrictEqual(["✅ Update finished."])
      })
    )

    it.effect("leave a copy alone when it matches the shipped skill", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          ".claude/skills/adamantite/SKILL.md": "# Adamantite 2\n",
          "skills-lock.json": makeSkillsLock("./node_modules/adamantite"),
        })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.outros).toStrictEqual([
          "✅ Managed packages and the Adamantite skill are up to date.",
        ])
      })
    )

    it.effect("leave a skill alone when the user installed it from another source", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          ".claude/skills/adamantite/SKILL.md": "# Adamantite 1\n",
          "skills-lock.json": makeSkillsLock("adelrodriguez/adamantite"),
        })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.outros).toStrictEqual([
          "✅ Managed packages and the Adamantite skill are up to date.",
        ])
      })
    )

    it.effect("warn and finish the update when the refresh fails", () =>
      Effect.gen(function* () {
        const files = makeSkillFiles({
          ".claude/skills/adamantite/SKILL.md": "# Adamantite 1\n",
          "skills-lock.json": makeSkillsLock("./node_modules/adamantite"),
        })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommand(updateCommand, [], {
          files,
          layers: [prompter.layer, installer.layer, runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual(
          expect.objectContaining({
            level: "warning",
            message: expect.stringContaining("to see why the skill refresh failed."),
          })
        )
      })
    )
  })
})
