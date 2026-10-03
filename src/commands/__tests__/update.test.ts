import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import updateCommand from "#commands/update.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxlintTsConfigContent } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import shadcnLint from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
}

/**
 * A project with the effect preset where only Oxlint is off its pin.
 */
function makeEffectFiles(oxlintConfig: string) {
  return createFileSystemTestContext({
    files: {
      "node_modules/@effect/tsgo/package.json": JSON.stringify({
        bin: { "effect-tsgo": "./dist/effect-tsgo.cjs" },
      }),
      "oxlint.config.ts": oxlintConfig,
      "package.json": manifest({
        devDependencies: { "@effect/tsgo": effectTsgo.version, oxlint: "1.0.0" },
        scripts: { check: "adamantite check", prepare: "adamantite prepare" },
      }),
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
      expect(installer.calls).toEqual([])
      expect(prompter.outros).toEqual(["✅ Adamantite is already up to date."])
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
      expect(installer.calls[0]?.packages).toEqual([`knip@${knip.version}`])
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
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
      expect(installer.calls[0]?.options).toEqual({ silent: true, workspace: true })
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
        message: "Run `adamantite doctor` to get the combined Markdown repair prompt.",
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
      expect(prompter.outros).toEqual(["❌ Update failed"])
    })
  )

  it.effect("patch for the effect preset after an update that does not touch @effect/tsgo", () =>
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
      expect(runner.invocations.map((invocation) => invocation.args.slice(1))).toEqual([
        ["patch", "--oxlint", "--typescript"],
      ])
    })
  )

  it.effect("skip the patch without the effect preset", () =>
    Effect.gen(function* () {
      const files = makeEffectFiles(toOxlintTsConfigContent([]))
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([])
    })
  )

  it.effect("fail when the patch fails after an update", () =>
    Effect.gen(function* () {
      const files = makeEffectFiles(toOxlintTsConfigContent(["effect"]))
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()
      const runner = createRunnerTestContext([1])

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer, runner.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      expect(prompter.outros).toEqual(["❌ Update failed"])
    })
  )
})
