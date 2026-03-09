import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import updateCommand from "#commands/update.ts"
import { FailedToInstallDependency } from "#errors.ts"
import { knip } from "#helpers/packages/knip.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

describe("update", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-update-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("dependency updates", () => {
    test("report when everything is already current and skip installation", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
              oxfmt: oxfmt.version,
              oxlint: oxlint.version,
              "oxlint-tsgolint": tsgolint.version,
              sherif: sherif.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(join(tempDir, "oxlint.config.ts"), "export default {}\n")

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "All adamantite dependencies are already up to date!",
      })
      expect(prompter.outros).toEqual(["✅ No updates needed"])
    })

    test("show proposed dependency updates and install exact target versions on confirmation", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              knip: "5.0.0",
              oxfmt: "^0.34.0",
              oxlint: "~1.49.0",
              "oxlint-tsgolint": "workspace:^0.14.0",
              sherif: "1.9.0",
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [true],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true },
          packages: [
            `oxlint@${oxlint.version}`,
            `oxlint-tsgolint@${tsgolint.version}`,
            `oxfmt@${oxfmt.version}`,
            `sherif@${sherif.version}`,
            `knip@${knip.version}`,
          ],
        },
      ])
      expect(prompter.logs).toContainEqual({
        level: "info",
        message: "The following dependencies will be updated:",
      })
      expect(prompter.logs).toContainEqual({
        level: "info",
        message: `  oxlint: ~1.49.0 \u2192 ${oxlint.version}`,
      })
      expect(prompter.outros).toEqual(["✅ Dependencies updated successfully!"])
    })
  })

  describe("user cancellation", () => {
    test("cancel dependency updates when the user declines", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: "1.0.0",
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])
      expect(prompter.outros).toEqual(["⚠️ Update cancelled"])
    })
  })

  describe("legacy oxlint migration", () => {
    test("migrate a legacy oxlint config even when no dependency updates are needed", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
              oxfmt: oxfmt.version,
              oxlint: oxlint.version,
              "oxlint-tsgolint": tsgolint.version,
              sherif: sherif.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(
        join(tempDir, ".oxlintrc.json"),
        JSON.stringify(
          {
            rules: {
              semi: "error",
            },
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])
      expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(false)

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain('"semi": "error"')
      expect(prompter.outros).toEqual(["✅ Oxlint config migrated to `oxlint.config.ts`!"])
    })
  })

  describe("dual-config warnings", () => {
    test("warn when both oxlint config formats are present and prefer oxlint.config.ts", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(
        join(tempDir, "oxlint.config.ts"),
        'export default { rules: { curly: "error" } }\n'
      )
      await writeFile(
        join(tempDir, ".oxlintrc.json"),
        JSON.stringify(
          {
            rules: {
              semi: "error",
            },
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
      })
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(true)
    })
  })

  describe("edge cases", () => {
    test("fail when dependency installation fails", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: "1.49.0",
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [true],
      })
      const installer = createDependencyInstallerTestContext({
        addDevDependenciesError: new FailedToInstallDependency({
          packages: [`oxlint@${oxlint.version}`],
        }),
      })

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("FailedToInstallDependency")
    })

    test("gracefully handle prompt cancellation during confirmation", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: "1.49.0",
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        cancelAtPromptIndex: 1,
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.cancels).toEqual(["You've cancelled the update process."])
      expect(prompter.outros).toEqual([])
      expect(installer.calls).toEqual([])
    })
  })
})
