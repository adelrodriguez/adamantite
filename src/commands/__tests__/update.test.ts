import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import updateCommand from "#commands/update.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { FailedToInstallDependency } from "#lib/shared/errors.ts"
import { MONOREPO_GUIDANCE } from "#lib/workspace/tsconfig.ts"
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
        message: "No changes needed.",
      })
      expect(prompter.outros).toEqual(["✅ Adamantite is already up to date."])
    })

    test("install dependency updates automatically", async () => {
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

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.confirmCalls).toEqual([])
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
        level: "success",
        message: "Dependencies updated successfully.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("leave missing managed configs for doctor when dependencies are already current", async () => {
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

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])
      expect(await testFile(join(tempDir, "oxlint.config.ts")).exists()).toBe(false)
      expect(await testFile(join(tempDir, "tsconfig.json")).exists()).toBe(false)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Some configuration follow-up belongs to `adamantite doctor --fix`.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Doctor follow-up: Create `oxlint.config.ts` for `oxlint`.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("update dependencies without creating missing managed configs", async () => {
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

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true },
          packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
        },
      ])
      expect(await testFile(join(tempDir, "oxlint.config.ts")).exists()).toBe(false)
      expect(await testFile(join(tempDir, "tsconfig.json")).exists()).toBe(false)
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Dependencies updated successfully.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Some configuration follow-up belongs to `adamantite doctor --fix`.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Doctor follow-up: Create `oxlint.config.ts` for `oxlint`.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })
  })

  describe("migrations", () => {
    test("migrate a legacy knip config even when no dependency updates are needed", async () => {
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
        join(tempDir, "knip.jsonc"),
        ["{", '  "entry": ["src/index.ts"],', '  "ignore": ["bunup.config.ts"],', "}", ""].join(
          "\n"
        )
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])
      expect(await testFile(join(tempDir, "knip.jsonc")).exists()).toBe(false)

      const knipConfig = await readFile(join(tempDir, "knip.config.ts"), "utf8")
      expect(knipConfig).toContain('import analyze from "adamantite/analyze"')
      expect(knipConfig).toContain('"src/index.ts"')
      expect(knipConfig).toContain('"bunup.config.ts"')
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Migrations ran successfully.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("migrate a legacy oxfmt config even when no dependency updates are needed", async () => {
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
        join(tempDir, ".oxfmtrc.jsonc"),
        [
          "{",
          "  // keep semantic override",
          '  "semi": true,',
          '  "singleQuote": true,',
          "}",
          "",
        ].join("\n")
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([])
      expect(await testFile(join(tempDir, ".oxfmtrc.jsonc")).exists()).toBe(false)

      const oxfmtConfig = await readFile(join(tempDir, "oxfmt.config.ts"), "utf8")
      expect(oxfmtConfig).toContain('import format from "adamantite/format"')
      expect(oxfmtConfig).toContain("semi: true")
      expect(oxfmtConfig).toContain("singleQuote: true")
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Migrations ran successfully.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

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
      expect(await testFile(join(tempDir, ".oxlintrc.json")).exists()).toBe(false)

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain('"semi": "error"')
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Migrations ran successfully.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("migrate the legacy typecheck script to check and then install required dependencies", async () => {
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

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true },
          packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
        },
      ])

      // SAFETY: the fixture written above and the update migrations only ever
      // put string values under scripts.
      const packageJson = JSON.parse(await readFile(join(tempDir, "package.json"), "utf8")) as {
        scripts: Record<string, string>
      }
      expect(packageJson.scripts).toEqual({
        check: "adamantite check",
      })

      expect(await testFile(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
      expect(await testFile(join(tempDir, "tsconfig.json")).exists()).toBe(true)
      expect(
        prompter.logs.filter((entry) => entry.level === "success").map((entry) => entry.message)
      ).toEqual(["Migrations ran successfully.", "Dependencies updated successfully."])
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("skip warning about a workflow that an earlier migration already regenerated", async () => {
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
              typecheck: "adamantite typecheck",
            },
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(join(tempDir, ".node-version"), "22.19.0\n")
      mkdirSync(join(tempDir, ".github", "workflows"), { recursive: true })
      await writeFile(
        join(tempDir, ".github", "workflows", "adamantite.yml"),
        'name: adamantite\njobs:\n  verify:\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: "26"\n'
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      // The typecheck migration adds the `check` script and regenerates the workflow, so the
      // node-version migration's check must see that state instead of warning from a stale one.
      const workflow = await readFile(
        join(tempDir, ".github", "workflows", "adamantite.yml"),
        "utf8"
      )
      expect(workflow).not.toContain('node-version: "26"')
      expect(prompter.logs).not.toContainEqual({
        level: "warning",
        message:
          "No CI-compatible managed scripts were found, so the GitHub Actions workflow was not updated.",
      })
    })

    test("surface migration warnings during a monorepo typecheck migration", async () => {
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
              typecheck: "adamantite typecheck",
            },
            version: "1.0.0",
            workspaces: ["packages/*"],
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await testFile(join(tempDir, "tsconfig.json")).exists()).toBe(false)

      for (const message of MONOREPO_GUIDANCE) {
        expect(prompter.logs).toContainEqual({ level: "warning", message })
      }
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
      expect(oxlintConfig).toContain("respectEslintDisableDirectives")
      expect(oxlintConfig).toContain("typeAware")
      expect(oxlintConfig).toContain("typeCheck")

      // SAFETY: the fixture written above and the update migrations only ever
      // put string values under scripts.
      const packageJson = JSON.parse(await readFile(join(tempDir, "package.json"), "utf8")) as {
        scripts: Record<string, string>
      }
      expect(packageJson.scripts.check).toBe("adamantite check")
      expect(packageJson.scripts.typecheck).toBeUndefined()
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Migrations ran successfully.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("leave current-format oxlint config updates to doctor", async () => {
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
      expect(oxlintConfig).not.toContain("respectEslintDisableDirectives")
      expect(oxlintConfig).not.toContain("typeAware")
      expect(oxlintConfig).not.toContain("typeCheck")
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Some configuration follow-up belongs to `adamantite doctor --fix`.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Doctor follow-up: Update `oxlint.config.ts` with Adamantite's required options.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })

    test("skip update when oxlint.config.ts already has typeAware and typeCheck", async () => {
      const originalConfig = [
        'import { defineConfig } from "oxlint"',
        'import core from "adamantite/lint"',
        "",
        "export default defineConfig({",
        '  options: { "respectEslintDisableDirectives": true, "typeAware": true, "typeCheck": true },',
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
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No changes needed.",
      })
      expect(prompter.outros).toEqual(["✅ Adamantite is already up to date."])
    })

    test("update an existing GitHub Actions workflow during typecheck migration", async () => {
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
              format: "adamantite format",
              typecheck: "adamantite typecheck",
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
        "name: adamantite\njobs:\n  verify:\n    strategy:\n      matrix:\n        include:\n          - name: check\n            command: bun run check\n          - name: types\n            command: bun run typecheck\n"
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
      expect(workflow).toContain("name: check")
      expect(workflow).toContain("name: format")
      expect(workflow).not.toContain("name: types")
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Migrations ran successfully.",
      })
      expect(prompter.outros).toEqual(["✅ Update completed successfully!"])
    })
  })

  describe("warnings and errors", () => {
    test("warn when both knip config formats are present and prefer knip.config.ts", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              knip: knip.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(
        join(tempDir, "knip.config.ts"),
        'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = { entry: ["src/index.ts"] }\n\nexport default config\n'
      )
      await writeFile(
        join(tempDir, "knip.json"),
        JSON.stringify({ entry: ["src/main.ts"] }, null, 2)
      )

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No changes needed.",
      })
      expect(await testFile(join(tempDir, "knip.config.ts")).exists()).toBe(true)
      expect(await testFile(join(tempDir, "knip.json")).exists()).toBe(true)
    })

    test("warn when both oxfmt config formats are present and prefer oxfmt.config.ts", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            devDependencies: {
              oxfmt: oxfmt.version,
            },
            name: "test-project",
            version: "1.0.0",
          },
          null,
          2
        )
      )
      await writeFile(
        join(tempDir, "oxfmt.config.ts"),
        'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({ semi: false })\n'
      )
      await writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify({ semi: true }, null, 2))

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No changes needed.",
      })
      expect(await testFile(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
      expect(await testFile(join(tempDir, ".oxfmtrc.json")).exists()).toBe(true)
    })

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
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "No changes needed.",
      })
      expect(await testFile(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
      expect(await testFile(join(tempDir, ".oxlintrc.json")).exists()).toBe(true)
    })

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

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext({
        addDevDependenciesError: new FailedToInstallDependency({
          packages: [`oxlint@${oxlint.version}`, `oxlint-tsgolint@${tsgolint.version}`],
        }),
      })

      const exit = await runCommand(updateCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit))
      expect(error).toMatchObject({ _tag: "FailedToInstallDependency" })
      expect(prompter.spinnerEntries).toContainEqual({
        message: "Failed to update dependencies",
        type: "stop",
      })
      expect(prompter.outros).toEqual(["❌ Update failed"])
    })
  })
})
