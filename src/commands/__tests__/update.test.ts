import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import updateCommand from "#commands/update.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

function manifest(value: PackageJson): string {
  return JSON.stringify({ name: "test-project", version: "1.0.0", ...value }, null, 2)
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

  it.effect("update known package versions", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": manifest({ devDependencies: { knip: "5.0.0" } }) },
      })
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(updateCommand, [], {
        files,
        layers: [prompter.layer, installer.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls[0]?.packages).toEqual([`knip@${knip.version}`])
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
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
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "1. Missing knip configuration",
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
})
