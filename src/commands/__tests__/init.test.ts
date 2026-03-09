import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import initCommand from "#commands/init.ts"
import { knip } from "#helpers/packages/knip.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { typescript } from "#helpers/packages/typescript.ts"
import {
  createDependencyInstallerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

async function readJson<T = Record<string, unknown>>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

describe("init", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(async () => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-init-test-"))
    process.chdir(tempDir)

    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-project",
          version: "1.0.0",
        },
        null,
        2
      )
    )
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("fresh project setup", () => {
    test("set up the selected files, scripts, and dependencies", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["check", "format", "typecheck", "analyze"], ["react"], ["vscode"]],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: false },
          packages: [
            "adamantite",
            `oxlint@${oxlint.version}`,
            `oxlint-tsgolint@${tsgolint.version}`,
            `oxfmt@${oxfmt.version}`,
            `typescript@${typescript.version}`,
            `knip@${knip.version}`,
          ],
        },
      ])

      const packageJson = await readJson(join(tempDir, "package.json"))
      expect(packageJson.scripts).toEqual({
        analyze: "adamantite analyze",
        check: "adamantite check",
        format: "adamantite format",
        typecheck: "adamantite typecheck",
      })

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain('import react from "adamantite/lint/react"')

      const oxfmtConfig = await readJson(join(tempDir, ".oxfmtrc.jsonc"))
      expect(oxfmtConfig.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")

      const tsconfig = await readJson<{ extends: string }>(join(tempDir, "tsconfig.json"))
      expect(tsconfig.extends).toBe("adamantite/typescript")

      const vscodeSettings = await readJson(join(tempDir, ".vscode", "settings.json"))
      expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")

      const knipConfig = await readJson(join(tempDir, "knip.json"))
      expect(knipConfig.$schema).toContain("knip")

      expect(prompter.logs).toContainEqual({
        level: "info",
        message: "Detected package manager: bun",
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Your project is now configured",
      })
      expect(prompter.outros).toEqual(["💠 Adamantite initialized successfully!"])
    })
  })

  describe("oxlint config handling", () => {
    test("migrate a legacy oxlint config into oxlint.config.ts", async () => {
      await writeFile(
        join(tempDir, ".oxlintrc.json"),
        JSON.stringify(
          {
            extends: ["adamantite/lint/node"],
            rules: { semi: "error" },
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        multiselectResponses: [["check"], ["react"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(false)

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain('import react from "adamantite/lint/react"')
      expect(oxlintConfig).toContain('import node from "adamantite/lint/node"')
      expect(oxlintConfig).toContain('"semi": "error"')
    })
  })

  describe("workspace installation", () => {
    test("use workspace installation when the project is a monorepo", async () => {
      await writeFile(
        join(tempDir, "package.json"),
        JSON.stringify(
          {
            name: "test-project",
            version: "1.0.0",
            workspaces: ["packages/*"],
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        multiselectResponses: [["check:monorepo"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: true },
          packages: ["adamantite", `sherif@${sherif.version}`],
        },
      ])
    })
  })

  describe("existing config updates", () => {
    test("update existing configs without dropping preserved user settings", async () => {
      await writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify({ semi: false }, null, 2))
      await writeFile(
        join(tempDir, "tsconfig.json"),
        JSON.stringify(
          {
            compilerOptions: {
              paths: {
                "@/*": ["src/*"],
              },
            },
          },
          null,
          2
        )
      )
      await Bun.write(
        join(tempDir, ".vscode", "settings.json"),
        JSON.stringify({ "editor.tabSize": 4 }, null, 2)
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["format", "typecheck"], ["vscode"]],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const oxfmtConfig = await readJson(join(tempDir, ".oxfmtrc.json"))
      expect(oxfmtConfig.semi).toBe(false)
      expect(oxfmtConfig.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")

      const tsconfig = await readJson<{
        compilerOptions: {
          paths: Record<string, string[]>
        }
        extends: string
      }>(join(tempDir, "tsconfig.json"))
      expect(tsconfig.extends).toBe("adamantite/typescript")
      expect(tsconfig.compilerOptions.paths).toEqual({
        "@/*": ["src/*"],
      })

      const vscodeSettings = await readJson(join(tempDir, ".vscode", "settings.json"))
      expect(vscodeSettings["editor.tabSize"]).toBe(4)
      expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")
    })
  })

  describe("selective setup", () => {
    test("apply only the requested scripts and editor setup", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["format"], ["zed"]],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: false },
          packages: ["adamantite", `oxfmt@${oxfmt.version}`],
        },
      ])

      const packageJson = await readJson(join(tempDir, "package.json"))
      expect(packageJson.scripts).toEqual({
        format: "adamantite format",
      })

      expect(await Bun.file(join(tempDir, ".oxfmtrc.jsonc")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, ".zed", "settings.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, "knip.json")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, ".vscode", "settings.json")).exists()).toBe(false)
    })
  })

  describe("dual-config warnings", () => {
    test("warn when both legacy and modern oxlint configs exist", async () => {
      await writeFile(
        join(tempDir, "oxlint.config.ts"),
        'export default { rules: { curly: "error" } }\n'
      )
      await writeFile(
        join(tempDir, ".oxlintrc.json"),
        JSON.stringify({ rules: { semi: "error" } }, null, 2)
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false],
        multiselectResponses: [["check"], [], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
      })
      expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(true)
    })
  })

  describe("edge cases", () => {
    test("fail when no package manager can be detected", async () => {
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext({
        detectedPackageManager: null,
      })

      const exit = await runCommand(initCommand, [], tempDir, [prompter.layer, installer.layer])

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("NoPackageManager")
    })

    test("create a GitHub Actions workflow for CI-compatible scripts when requested", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [true, true],
        multiselectResponses: [["check", "format", "typecheck"], ["react"], ["zed"]],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], tempDir, [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: false },
          packages: [
            "adamantite",
            `oxlint@${oxlint.version}`,
            `oxlint-tsgolint@${tsgolint.version}`,
            `oxfmt@${oxfmt.version}`,
            `typescript@${typescript.version}`,
          ],
        },
      ])

      const workflowPath = join(tempDir, ".github", "workflows", "adamantite.yml")
      expect(await Bun.file(workflowPath).exists()).toBe(true)

      const workflow = await readFile(workflowPath, "utf8")
      expect(workflow).toContain("oven-sh/setup-bun@v2")
      expect(workflow).toContain("name: lint")
      expect(workflow).toContain("name: format")
      expect(workflow).toContain("name: types")
      expect(workflow).toContain("command: bun run check")
      expect(workflow).toContain("command: bun run format --check")
      expect(workflow).toContain("command: bun run typecheck")
    })

    test("gracefully handle prompt cancellation", async () => {
      const prompter = createPrompterTestContext({
        cancelAtPromptIndex: 1,
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], tempDir, [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.cancels).toEqual(["You've cancelled the initialization process."])
      expect(prompter.outros).toEqual([])
      expect(installer.calls).toEqual([])
    })
  })
})
