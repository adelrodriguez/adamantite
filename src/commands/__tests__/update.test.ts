import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import updateCommand from "#commands/update.ts"
import { knip } from "#lib/integrations/tooling/knip.ts"
import { oxfmt } from "#lib/integrations/tooling/oxfmt.ts"
import { oxlint, tsgolint } from "#lib/integrations/tooling/oxlint.ts"
import { sherif } from "#lib/integrations/tooling/sherif.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
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
      expect(prompter.outros).toEqual(["✅ Adamantite configuration migrated successfully!"])
    })
  })

  describe("typecheck migration", () => {
    test("migrate the legacy typecheck script to check and install required dependencies", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              typescript: "5.0.0",
            },
            name: "test-project",
            scripts: {
              typecheck: "adamantite typecheck",
            },
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
          packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
        },
      ])

      const packageJson = JSON.parse(await readFile(join(tempDir, "package.json"), "utf8")) as {
        scripts: Record<string, string>
      }
      expect(packageJson.scripts).toEqual({
        check: "adamantite check",
      })

      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(true)
      expect(prompter.outros).toEqual(["✅ Adamantite configuration migrated successfully!"])
    })

    test("enable type-checked linting in an existing oxlint.config.ts during typecheck migration", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
              "oxlint-tsgolint": tsgolint.version,
              typescript: "5.0.0",
            },
            name: "test-project",
            scripts: {
              typecheck: "adamantite typecheck",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(
        join(tempDir, "oxlint.config.ts"),
        [
          'import { defineConfig } from "oxlint"',
          'import core from "adamantite/lint"',
          "",
          "export default defineConfig({",
          "  extends: [core],",
          "})",
          "",
        ].join("\n")
      )
      await writeFile(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ extends: "adamantite/typescript" })
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain("typeAware")
      expect(oxlintConfig).toContain("typeCheck")

      const packageJson = JSON.parse(await readFile(join(tempDir, "package.json"), "utf8")) as {
        scripts: Record<string, string>
      }
      expect(packageJson.scripts.check).toBe("adamantite check")
      expect(packageJson.scripts.typecheck).toBeUndefined()
      expect(prompter.outros).toEqual(["✅ Adamantite configuration migrated successfully!"])
    })
  })

  describe("oxlint type-check options", () => {
    test("ensure typeAware and typeCheck in an existing oxlint.config.ts that lacks them", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
              "oxlint-tsgolint": tsgolint.version,
            },
            name: "test-project",
            scripts: {
              check: "adamantite check",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(
        join(tempDir, "oxlint.config.ts"),
        [
          'import { defineConfig } from "oxlint"',
          'import core from "adamantite/lint"',
          "",
          "export default defineConfig({",
          "  extends: [core],",
          "})",
          "",
        ].join("\n")
      )
      await writeFile(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ extends: "adamantite/typescript" })
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain("typeAware")
      expect(oxlintConfig).toContain("typeCheck")
    })

    test("skip update when oxlint.config.ts already has typeAware and typeCheck", async () => {
      const originalConfig = [
        'import { defineConfig } from "oxlint"',
        'import core from "adamantite/lint"',
        "",
        "export default defineConfig({",
        '  options: { "typeAware": true, "typeCheck": true },',
        "  extends: [core],",
        "})",
        "",
      ].join("\n")

      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxlint: oxlint.version,
              "oxlint-tsgolint": tsgolint.version,
            },
            name: "test-project",
            scripts: {
              check: "adamantite check",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(join(tempDir, "oxlint.config.ts"), originalConfig)
      await writeFile(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ extends: "adamantite/typescript" })
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toBe(originalConfig)
    })
  })

  describe("workflow migration", () => {
    test("update an existing GitHub Actions workflow even when dependencies are already current", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxfmt: oxfmt.version,
              oxlint: oxlint.version,
              "oxlint-tsgolint": tsgolint.version,
            },
            name: "test-project",
            scripts: {
              check: "adamantite check",
              format: "adamantite format",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(join(tempDir, "oxlint.config.ts"), "export default {}\n")
      await writeFile(
        join(tempDir, "tsconfig.json"),
        JSON.stringify({ extends: "adamantite/typescript" })
      )
      mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true })
      await writeFile(
        join(tempDir, ".github", "workflows", "adamantite.yml"),
        "name: adamantite\njobs:\n  verify:\n    strategy:\n      matrix:\n        include:\n          - name: lint\n            command: bun run check\n          - name: types\n            command: bun run typecheck\n"
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])

      const workflow = await readFile(
        join(tempDir, ".github", "workflows", "adamantite.yml"),
        "utf8"
      )
      expect(workflow).toContain("name: lint")
      expect(workflow).toContain("name: format")
      expect(workflow).not.toContain("name: types")
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
            scripts: {
              check: "adamantite check",
            },
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
          packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
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
            scripts: {
              check: "adamantite check",
            },
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
