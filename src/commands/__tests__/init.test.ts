import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import initCommand from "#commands/init.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { CliNotFound } from "#lib/shared/errors.ts"
import {
  ADAMANTITE_AGENTS_END_MARKER,
  ADAMANTITE_AGENTS_START_MARKER,
} from "#lib/workspace/agents.ts"
import {
  createDependencyInstallerTestContext,
  createRunnerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

async function readJson<T = Record<string, unknown>>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

function countOccurrences(content: string, search: string) {
  return content.split(search).length - 1
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
        confirmResponses: [true, false, false, false],
        multiselectResponses: [["check", "format", "analyze"], ["react"], ["vscode"]],
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
            `knip@${knip.version}`,
          ],
        },
      ])

      const packageJson = await readJson(join(tempDir, "package.json"))
      expect(packageJson.scripts).toEqual({
        analyze: "adamantite analyze",
        check: "adamantite check",
        format: "adamantite format",
      })

      const oxlintConfig = await readFile(join(tempDir, "oxlint.config.ts"), "utf8")
      expect(oxlintConfig).toContain('import react from "adamantite/lint/react"')
      expect(oxlintConfig).toContain('"respectEslintDisableDirectives": true')
      expect(oxlintConfig).toContain('"typeAware": true')
      expect(oxlintConfig).toContain('"typeCheck": true')

      const oxfmtConfig = await readFile(join(tempDir, "oxfmt.config.ts"), "utf8")
      expect(oxfmtConfig).toContain('import { defineConfig } from "oxfmt"')
      expect(oxfmtConfig).toContain('import format from "adamantite/format"')
      expect(oxfmtConfig).toContain("export default defineConfig(format)")

      const tsconfig = await readJson<{ extends: string }>(join(tempDir, "tsconfig.json"))
      expect(tsconfig.extends).toBe("adamantite/typescript")

      const vscodeSettings = await readJson(join(tempDir, ".vscode", "settings.json"))
      expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")

      const knipConfig = await readFile(join(tempDir, "knip.config.ts"), "utf8")
      expect(knipConfig).toContain('import type { KnipConfig } from "knip"')
      expect(knipConfig).toContain('import analyze from "adamantite/analyze"')
      expect(knipConfig).toContain("const config: KnipConfig = analyze")

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
    test("keep a legacy oxlint config in place during init", async () => {
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
        confirmResponses: [true, false, false],
        multiselectResponses: [["check"], ["react"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await Bun.file(join(tempDir, ".oxlintrc.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(false)
      expect(prompter.logs).toContainEqual({
        level: "info",
        message:
          "Legacy `.oxlintrc.json` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest oxlint config.",
      })

      const oxlintConfig = await readFile(join(tempDir, ".oxlintrc.json"), "utf8")
      expect(oxlintConfig).toContain('"semi": "error"')
    })
  })

  describe("oxfmt config handling", () => {
    test("keep a legacy oxfmt config in place during init", async () => {
      await writeFile(
        join(tempDir, ".oxfmtrc.json"),
        JSON.stringify(
          {
            semi: true,
          },
          null,
          2
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await Bun.file(join(tempDir, ".oxfmtrc.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(false)
      expect(prompter.logs).toContainEqual({
        level: "info",
        message:
          "Legacy `.oxfmtrc.json` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest oxfmt config.",
      })

      const oxfmtConfig = await readFile(join(tempDir, ".oxfmtrc.json"), "utf8")
      expect(oxfmtConfig).toContain('"semi": true')
    })
  })

  describe("knip config handling", () => {
    test("keep a legacy knip config in place during init", async () => {
      await writeFile(
        join(tempDir, "knip.jsonc"),
        ["{", '  "entry": ["src/index.ts"],', '  "ignore": ["bunup.config.ts"],', "}", ""].join(
          "\n"
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["analyze"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await Bun.file(join(tempDir, "knip.jsonc")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(false)
      expect(prompter.logs).toContainEqual({
        level: "info",
        message:
          "Legacy `knip.jsonc` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest knip config.",
      })

      const knipConfig = await readFile(join(tempDir, "knip.jsonc"), "utf8")
      expect(knipConfig).toContain('"src/index.ts"')
      expect(knipConfig).toContain('"bunup.config.ts"')
    })

    test("keep legacy knip configs in place when both knip.json and knip.jsonc exist", async () => {
      await writeFile(
        join(tempDir, "knip.json"),
        JSON.stringify({ entry: ["src/other.ts"] }, null, 2)
      )
      await writeFile(
        join(tempDir, "knip.jsonc"),
        ["{", '  "entry": ["src/index.ts"],', '  "ignore": ["bunup.config.ts"],', "}", ""].join(
          "\n"
        )
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["analyze"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed.",
      })
      expect(prompter.logs).toContainEqual({
        level: "info",
        message:
          "Legacy `knip.jsonc` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest knip config.",
      })
      expect(await Bun.file(join(tempDir, "knip.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "knip.jsonc")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(false)
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
        confirmResponses: [false, false],
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

  describe("monorepo TypeScript setup", () => {
    const monorepoGuidanceLogs = [
      {
        level: "info",
        message:
          "Skipping `tsconfig.json` setup: a root config in a monorepo makes TypeScript treat all packages as one project.",
      },
      {
        level: "info",
        message:
          'To use the TypeScript preset, add `"extends": "adamantite/typescript"` to each package\'s `tsconfig.json` or to a shared base config.',
      },
    ] as const

    beforeEach(async () => {
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
    })

    test("print guidance instead of creating a root tsconfig in a monorepo", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [true, false, false],
        multiselectResponses: [["check"], [], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(false)

      for (const log of monorepoGuidanceLogs) {
        expect(prompter.logs).toContainEqual(log)
      }
    })

    test("print guidance instead of creating a root tsconfig in non-interactive mode", async () => {
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(
        initCommand,
        ["--non-interactive", "--script", "check", "--typescript"],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(false)

      for (const log of monorepoGuidanceLogs) {
        expect(prompter.logs).toContainEqual(log)
      }
    })

    test("leave an existing root tsconfig unchanged in a monorepo", async () => {
      const existingTsconfig = JSON.stringify(
        {
          extends: "./tooling/tsconfig.base.json",
          files: [],
          references: [{ path: "packages/app" }],
        },
        null,
        2
      )
      await writeFile(join(tempDir, "tsconfig.json"), existingTsconfig)

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(
        initCommand,
        ["--non-interactive", "--script", "check", "--typescript"],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await readFile(join(tempDir, "tsconfig.json"), "utf8")).toBe(existingTsconfig)
    })
  })

  describe("existing config updates", () => {
    test("update existing configs without dropping preserved user settings", async () => {
      const originalOxfmtConfig = [
        'import { defineConfig } from "oxfmt"',
        'import format from "adamantite/format"',
        "",
        "export default defineConfig({",
        "  ...format,",
        "  semi: false,",
        "})",
        "",
      ].join("\n")

      await writeFile(join(tempDir, "oxfmt.config.ts"), originalOxfmtConfig)
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
        confirmResponses: [true, false, false, false],
        multiselectResponses: [["check", "format"], [], ["vscode"]],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const oxfmtConfig = await readFile(join(tempDir, "oxfmt.config.ts"), "utf8")
      expect(oxfmtConfig).toBe(originalOxfmtConfig)

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
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
    })
  })

  describe("selective setup", () => {
    test("apply only the requested scripts and editor setup", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [false, false, false],
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

      expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, ".zed", "settings.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, ".vscode", "settings.json")).exists()).toBe(false)
    })
  })

  describe("non-interactive setup", () => {
    test("configure the project entirely from flags without showing prompts", async () => {
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(
        initCommand,
        [
          "--non-interactive",
          "--script",
          "check",
          "--script",
          "format",
          "--script",
          "analyze",
          "--preset",
          "react",
          "--editor",
          "zed",
          "--typescript",
          "--install-extensions",
          "--github-actions",
          "--agents",
        ],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.confirmCalls).toEqual([])
      expect(prompter.multiselectCalls).toEqual([])
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: false },
          packages: [
            "adamantite",
            `oxlint@${oxlint.version}`,
            `oxlint-tsgolint@${tsgolint.version}`,
            `oxfmt@${oxfmt.version}`,
            `knip@${knip.version}`,
          ],
        },
      ])

      const packageJson = await readJson(join(tempDir, "package.json"))
      expect(packageJson.scripts).toEqual({
        analyze: "adamantite analyze",
        check: "adamantite check",
        format: "adamantite format",
      })
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "oxfmt.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "knip.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, ".zed", "settings.json")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "AGENTS.md")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, ".github", "workflows", "adamantite.yml")).exists()).toBe(
        true
      )
    })

    test("treat omitted boolean flags as false and deduplicate repeated selections", async () => {
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(
        initCommand,
        ["--non-interactive", "--script", "format", "--script", "format"],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.confirmCalls).toEqual([])
      expect(prompter.multiselectCalls).toEqual([])
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: false },
          packages: ["adamantite", `oxfmt@${oxfmt.version}`],
        },
      ])
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, "AGENTS.md")).exists()).toBe(false)
      expect(await Bun.file(join(tempDir, ".github", "workflows", "adamantite.yml")).exists()).toBe(
        false
      )
    })

    test("configure every available script in a monorepo", async () => {
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

      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(
        initCommand,
        [
          "--non-interactive",
          "--script",
          "check",
          "--script",
          "fix",
          "--script",
          "format",
          "--script",
          "check:monorepo",
          "--script",
          "fix:monorepo",
          "--script",
          "analyze",
        ],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(installer.calls).toEqual([
        {
          options: { silent: true, workspace: true },
          packages: [
            "adamantite",
            `oxlint@${oxlint.version}`,
            `oxlint-tsgolint@${tsgolint.version}`,
            `oxfmt@${oxfmt.version}`,
            `sherif@${sherif.version}`,
            `knip@${knip.version}`,
          ],
        },
      ])

      const packageJson = await readJson(join(tempDir, "package.json"))
      expect(packageJson.scripts).toEqual({
        analyze: "adamantite analyze",
        check: "adamantite check",
        "check:monorepo": "adamantite monorepo",
        fix: "adamantite fix",
        "fix:monorepo": "adamantite monorepo --fix",
        format: "adamantite format",
      })
    })

    test.each([
      {
        args: ["--non-interactive"],
        name: "a missing script",
        reason: "Select at least one script with `--script <name>`.",
      },
      {
        args: ["--non-interactive", "--script", "format", "--preset", "react"],
        name: "a preset without linting",
        reason: "`--preset` requires the `check` or `fix` script.",
      },
      {
        args: ["--non-interactive", "--script", "format", "--typescript"],
        name: "TypeScript without linting",
        reason: "`--typescript` requires the `check` or `fix` script.",
      },
      {
        args: ["--non-interactive", "--script", "format", "--install-extensions"],
        name: "extension installation without an editor",
        reason: "`--install-extensions` requires at least one `--editor`.",
      },
      {
        args: ["--non-interactive", "--script", "fix", "--github-actions"],
        name: "GitHub Actions without a CI-compatible script",
        reason: "`--github-actions` requires a CI-compatible script.",
      },
      {
        args: ["--non-interactive", "--script", "check:monorepo"],
        name: "a monorepo script outside a monorepo",
        reason: "Monorepo scripts can only be selected in a detected monorepo.",
      },
      {
        args: ["--script", "format"],
        name: "setup flags without non-interactive mode",
        reason: "Setup flags require `--non-interactive`.",
      },
    ])("reject $name before changing the project", async ({ args, reason }) => {
      const originalPackageJson = await readFile(join(tempDir, "package.json"), "utf8")
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, args, [prompter.layer, installer.layer])

      expect(Exit.isFailure(exit)).toBe(true)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "InvalidInitOptions",
        reason,
      })
      expect(installer.calls).toEqual([])
      expect(await readFile(join(tempDir, "package.json"), "utf8")).toBe(originalPackageJson)
    })

    test("reject GitHub Actions with an unsupported package manager before changing the project", async () => {
      const originalPackageJson = await readFile(join(tempDir, "package.json"), "utf8")
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext({
        detectedPackageManager: { name: "aube" },
      })

      const exit = await runCommand(
        initCommand,
        ["--non-interactive", "--script", "check", "--github-actions"],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
        _tag: "InvalidInitOptions",
        reason:
          "`--github-actions` does not support the detected package manager `aube`. Use bun, deno, npm, pnpm, or yarn.",
      })
      expect(installer.calls).toEqual([])
      expect(await readFile(join(tempDir, "package.json"), "utf8")).toBe(originalPackageJson)
      expect(await Bun.file(join(tempDir, ".github", "workflows", "adamantite.yml")).exists()).toBe(
        false
      )
    })

    test("reject unknown selection values during CLI parsing", async () => {
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(
        initCommand,
        ["--non-interactive", "--script", "unknown"],
        [prompter.layer, installer.layer]
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(installer.calls).toEqual([])
    })
  })

  describe("agents guidance", () => {
    test("adds script-specific Adamantite guidance to AGENTS.md when confirmed", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [false, false, true],
        multiselectResponses: [["check", "format", "analyze"], [], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
      expect(agents).toContain(ADAMANTITE_AGENTS_START_MARKER)
      expect(agents).toContain("## Adamantite")
      expect(agents).toContain("Run `bun run format` after editing files")
      expect(agents).toContain("Run `bun run check` to catch lint and type issues")
      expect(agents).toContain("Run `bun run analyze` after changing dependencies")
      expect(agents).toContain("adamantite doctor --fix")
      expect(agents).not.toContain("adamantite fix")
      expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
      expect(agents.endsWith("\n")).toBe(true)
    })

    test("uses the detected package manager in AGENTS.md guidance", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [false, true],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext({
        detectedPackageManager: { name: "npm" },
      })

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
      expect(agents).toContain("Run `npm run format` after editing files")
    })

    test("appends Adamantite guidance to an existing AGENTS.md without markers", async () => {
      const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n"
      await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

      const prompter = createPrompterTestContext({
        confirmResponses: [false, true],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
      expect(agents.startsWith(`${existingAgents}\n${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(true)
      expect(agents).toContain("## Adamantite")
      expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
    })

    test("replaces existing Adamantite guidance without duplicating markers", async () => {
      await writeFile(
        join(tempDir, "AGENTS.md"),
        `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nold content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false, true],
        multiselectResponses: [["analyze"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)

      const agents = await readFile(join(tempDir, "AGENTS.md"), "utf8")
      expect(agents).toContain("# Existing Instructions")
      expect(agents).toContain("Run `bun run analyze` after changing dependencies")
      expect(agents).not.toContain("old content")
      expect(countOccurrences(agents, ADAMANTITE_AGENTS_START_MARKER)).toBe(1)
      expect(countOccurrences(agents, ADAMANTITE_AGENTS_END_MARKER)).toBe(1)
    })

    test("leaves AGENTS.md unchanged when Adamantite start marker is missing its end marker", async () => {
      const existingAgents = `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nmanual content\n`
      await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

      const prompter = createPrompterTestContext({
        confirmResponses: [false, true],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again.",
      })
      expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe(existingAgents)
    })

    test("leaves AGENTS.md unchanged when Adamantite end marker is missing its start marker", async () => {
      const existingAgents = `# Existing Instructions\n\nmanual content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
      await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

      const prompter = createPrompterTestContext({
        confirmResponses: [false, true],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again.",
      })
      expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe(existingAgents)
    })

    test("leaves AGENTS.md unchanged when guidance is declined", async () => {
      const existingAgents = "# Existing Instructions\n"
      await writeFile(join(tempDir, "AGENTS.md"), existingAgents)

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(await readFile(join(tempDir, "AGENTS.md"), "utf8")).toBe(existingAgents)
    })

    test("continues initialization when AGENTS.md cannot be read", async () => {
      const agentsPath = join(tempDir, "AGENTS.md")
      await mkdir(agentsPath)

      const prompter = createPrompterTestContext({
        confirmResponses: [false, true],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: expect.stringMatching(
          /Could not update AGENTS\.md\. Failed to read `.*\/AGENTS\.md`\.( Cause: .*)? Adamantite will continue initialization\./
        ),
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Your project is now configured",
      })
      expect(prompter.outros).toEqual(["💠 Adamantite initialized successfully!"])
    })

    test("gracefully handles AGENTS.md prompt cancellation", async () => {
      const prompter = createPrompterTestContext({
        cancelAtPromptIndex: 4,
        confirmResponses: [false],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.cancels).toEqual(["You've cancelled the initialization process."])
      expect(prompter.outros).toEqual([])
      expect(installer.calls).toEqual([])
      expect(await Bun.file(join(tempDir, "AGENTS.md")).exists()).toBe(false)
    })
  })

  describe("dual-config warnings", () => {
    test("warn when both legacy and modern knip configs exist", async () => {
      await writeFile(
        join(tempDir, "knip.config.ts"),
        'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = { entry: ["src/index.ts"] }\n\nexport default config\n'
      )
      await writeFile(
        join(tempDir, "knip.json"),
        JSON.stringify({ entry: ["src/main.ts"] }, null, 2)
      )

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["analyze"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
      })
      expect(await Bun.file(join(tempDir, "knip.json")).exists()).toBe(true)
    })

    test("warn when both legacy and modern oxfmt configs exist", async () => {
      await writeFile(
        join(tempDir, "oxfmt.config.ts"),
        'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({ semi: false })\n'
      )
      await writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify({ semi: true }, null, 2))

      const prompter = createPrompterTestContext({
        confirmResponses: [false, false],
        multiselectResponses: [["format"], []],
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message:
          "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
      })
      expect(await Bun.file(join(tempDir, ".oxfmtrc.json")).exists()).toBe(true)
    })

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
        confirmResponses: [true, false, false],
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

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("NoPackageManager")
    })

    test("create a GitHub Actions workflow for CI-compatible scripts when requested", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [true, true, true, false],
        multiselectResponses: [["check", "format"], ["react"], ["zed"]],
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
          ],
        },
      ])

      const workflowPath = join(tempDir, ".github", "workflows", "adamantite.yml")
      expect(await Bun.file(workflowPath).exists()).toBe(true)

      const workflow = await readFile(workflowPath, "utf8")
      expect(workflow).toContain("oven-sh/setup-bun@v2")
      expect(workflow).toContain("name: check")
      expect(workflow).toContain("name: format")
      expect(workflow).toContain("command: bun run check")
      expect(workflow).toContain("command: bun run format --check")
    })

    test("skip tsconfig setup when the user declines the TypeScript preset prompt", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [false, false, false],
        multiselectResponses: [["check"], [], []],
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
          ],
        },
      ])
      expect(await Bun.file(join(tempDir, "oxlint.config.ts")).exists()).toBe(true)
      expect(await Bun.file(join(tempDir, "tsconfig.json")).exists()).toBe(false)
    })

    test("gracefully handle prompt cancellation", async () => {
      const prompter = createPrompterTestContext({
        cancelAtPromptIndex: 1,
      })
      const installer = createDependencyInstallerTestContext()

      const exit = await runCommand(initCommand, [], [prompter.layer, installer.layer])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.cancels).toEqual(["You've cancelled the initialization process."])
      expect(prompter.outros).toEqual([])
      expect(installer.calls).toEqual([])
    })

    test("continue successfully and show the exit code when the extension install fails", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [true, false, false],
        multiselectResponses: [["format"], ["vscode"]],
      })
      const installer = createDependencyInstallerTestContext()
      const runner = createRunnerTestContext({
        implementation: (options) =>
          Effect.succeed(ChildProcessSpawner.ExitCode(options.command === "code" ? 1 : 0)),
      })

      const exit = await runCommand(
        initCommand,
        [],
        [prompter.layer, installer.layer, runner.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)

      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "⚠️ Failed to install `oxc.oxc-vscode`. The `code` CLI exited with code 1.",
      })
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Please install it manually after setup completes.",
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Your project is now configured",
      })
    })

    test("continue successfully and show guidance when the VS Code CLI is unavailable", async () => {
      const prompter = createPrompterTestContext({
        confirmResponses: [true, false, false],
        multiselectResponses: [["format"], ["vscode"]],
      })
      const installer = createDependencyInstallerTestContext()
      const runner = createRunnerTestContext({
        implementation: (options) =>
          options.command === "code"
            ? Effect.fail(new CliNotFound({ command: "code" }))
            : Effect.succeed(ChildProcessSpawner.ExitCode(0)),
      })

      const exit = await runCommand(
        initCommand,
        [],
        [prompter.layer, installer.layer, runner.layer]
      )

      expect(Exit.isSuccess(exit)).toBe(true)

      expect(prompter.logs).toContainEqual({
        level: "error",
        message: "VSCode CLI ('code' command) not found.",
      })
      expect(prompter.logs).toContainEqual({
        level: "info",
        message: "To install it:",
      })
      expect(prompter.logs).toContainEqual({
        level: "success",
        message: "Your project is now configured",
      })
      expect(prompter.outros).toEqual(["💠 Adamantite initialized successfully!"])

      expect(await Bun.file(join(tempDir, ".vscode", "settings.json")).exists()).toBe(true)
    })
  })
})
