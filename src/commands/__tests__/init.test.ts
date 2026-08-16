import { mkdtempSync, rmSync } from "node:fs"
import { mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { JsonObject } from "type-fest"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
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

async function readJson<T = JsonObject>(path: string): Promise<T> {
  // SAFETY: every caller asserts the shape of a JSON fixture this test suite wrote itself.
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
    it.effect("set up the selected files, scripts, and dependencies", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check", "format", "analyze"], ["react"], ["vscode"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

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

        const packageJson = yield* Effect.promise(() => readJson(join(tempDir, "package.json")))
        expect(packageJson.scripts).toEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
          format: "adamantite format",
        })

        const oxlintConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, "oxlint.config.ts"), "utf8")
        )
        expect(oxlintConfig).toContain('import react from "adamantite/lint/react"')
        expect(oxlintConfig).toContain('"respectEslintDisableDirectives": true')
        expect(oxlintConfig).toContain('"typeAware": true')
        expect(oxlintConfig).toContain('"typeCheck": true')

        const oxfmtConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, "oxfmt.config.ts"), "utf8")
        )
        expect(oxfmtConfig).toContain('import { defineConfig } from "oxfmt"')
        expect(oxfmtConfig).toContain('import format from "adamantite/format"')
        expect(oxfmtConfig).toContain("export default defineConfig(format)")

        const tsconfig = yield* Effect.promise(() =>
          readJson<{ extends: string }>(join(tempDir, "tsconfig.json"))
        )
        expect(tsconfig.extends).toBe("adamantite/typescript")

        const vscodeSettings = yield* Effect.promise(() =>
          readJson(join(tempDir, ".vscode", "settings.json"))
        )
        expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")

        const knipConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, "knip.config.ts"), "utf8")
        )
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
    )
  })

  describe("oxlint config handling", () => {
    it.effect("keep a legacy oxlint config in place during init", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["check"], ["react"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, ".oxlintrc.json")).exists())
        ).toBe(true)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxlint.config.ts")).exists())
        ).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `.oxlintrc.json` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest oxlint config.",
        })

        const oxlintConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, ".oxlintrc.json"), "utf8")
        )
        expect(oxlintConfig).toContain('"semi": "error"')
      })
    )
  })

  describe("oxfmt config handling", () => {
    it.effect("keep a legacy oxfmt config in place during init", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".oxfmtrc.json"),
            JSON.stringify(
              {
                semi: true,
              },
              null,
              2
            )
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, ".oxfmtrc.json")).exists())).toBe(
          true
        )
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxfmt.config.ts")).exists())
        ).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `.oxfmtrc.json` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest oxfmt config.",
        })

        const oxfmtConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, ".oxfmtrc.json"), "utf8")
        )
        expect(oxfmtConfig).toContain('"semi": true')
      })
    )
  })

  describe("knip config handling", () => {
    it.effect("keep a legacy knip config in place during init", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "knip.jsonc"),
            ["{", '  "entry": ["src/index.ts"],', '  "ignore": ["bunup.config.ts"],', "}", ""].join(
              "\n"
            )
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "knip.jsonc")).exists())).toBe(
          true
        )
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "knip.config.ts")).exists())
        ).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `knip.jsonc` was preserved during `adamantite init`. Run `adamantite doctor --fix` to migrate it to the latest knip config.",
        })

        const knipConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, "knip.jsonc"), "utf8")
        )
        expect(knipConfig).toContain('"src/index.ts"')
        expect(knipConfig).toContain('"bunup.config.ts"')
      })
    )

    it.effect("keep legacy knip configs in place when both knip.json and knip.jsonc exist", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "knip.json"),
            JSON.stringify({ entry: ["src/other.ts"] }, null, 2)
          )
        )
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "knip.jsonc"),
            ["{", '  "entry": ["src/index.ts"],', '  "ignore": ["bunup.config.ts"],', "}", ""].join(
              "\n"
            )
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

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
        expect(yield* Effect.promise(() => testFile(join(tempDir, "knip.json")).exists())).toBe(
          true
        )
        expect(yield* Effect.promise(() => testFile(join(tempDir, "knip.jsonc")).exists())).toBe(
          true
        )
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "knip.config.ts")).exists())
        ).toBe(false)
      })
    )
  })

  describe("workspace installation", () => {
    it.effect("use workspace installation when the project is a monorepo", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["check:monorepo"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([
          {
            options: { silent: true, workspace: true },
            packages: ["adamantite", `sherif@${sherif.version}`],
          },
        ])
      })
    )
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

    it.effect("print guidance instead of creating a root tsconfig in a monorepo", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "tsconfig.json")).exists())).toBe(
          false
        )

        for (const log of monorepoGuidanceLogs) {
          expect(prompter.logs).toContainEqual(log)
        }
      })
    )

    it.effect("print guidance instead of creating a root tsconfig in non-interactive mode", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--typescript"],
          [prompter.layer, installer.layer]
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "tsconfig.json")).exists())).toBe(
          false
        )

        for (const log of monorepoGuidanceLogs) {
          expect(prompter.logs).toContainEqual(log)
        }
      })
    )

    it.effect("leave an existing root tsconfig unchanged in a monorepo", () =>
      Effect.gen(function* () {
        const existingTsconfig = JSON.stringify(
          {
            extends: "./tooling/tsconfig.base.json",
            files: [],
            references: [{ path: "packages/app" }],
          },
          null,
          2
        )
        yield* Effect.promise(() => writeFile(join(tempDir, "tsconfig.json"), existingTsconfig))

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--typescript"],
          [prompter.layer, installer.layer]
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* Effect.promise(() => readFile(join(tempDir, "tsconfig.json"), "utf8"))).toBe(
          existingTsconfig
        )
      })
    )
  })

  describe("existing config updates", () => {
    it.effect("update existing configs without dropping preserved user settings", () =>
      Effect.gen(function* () {
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
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "oxfmt.config.ts"), originalOxfmtConfig)
        )
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".vscode", "settings.json"),
            JSON.stringify({ "editor.tabSize": 4 }, null, 2)
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check", "format"], [], ["vscode"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)

        const oxfmtConfig = yield* Effect.promise(() =>
          readFile(join(tempDir, "oxfmt.config.ts"), "utf8")
        )
        expect(oxfmtConfig).toBe(originalOxfmtConfig)

        const tsconfig = yield* Effect.promise(() =>
          readJson<{
            compilerOptions: {
              paths: Record<string, string[]>
            }
            extends: string
          }>(join(tempDir, "tsconfig.json"))
        )
        expect(tsconfig.extends).toBe("adamantite/typescript")
        expect(tsconfig.compilerOptions.paths).toEqual({
          "@/*": ["src/*"],
        })

        const vscodeSettings = yield* Effect.promise(() =>
          readJson(join(tempDir, ".vscode", "settings.json"))
        )
        expect(vscodeSettings["editor.tabSize"]).toBe(4)
        expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxlint.config.ts")).exists())
        ).toBe(true)
      })
    )
  })

  describe("selective setup", () => {
    it.effect("apply only the requested scripts and editor setup", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["format"], ["zed"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([
          {
            options: { silent: true, workspace: false },
            packages: ["adamantite", `oxfmt@${oxfmt.version}`],
          },
        ])

        const packageJson = yield* Effect.promise(() => readJson(join(tempDir, "package.json")))
        expect(packageJson.scripts).toEqual({
          format: "adamantite format",
        })

        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxfmt.config.ts")).exists())
        ).toBe(true)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, ".zed", "settings.json")).exists())
        ).toBe(true)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxlint.config.ts")).exists())
        ).toBe(false)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "tsconfig.json")).exists())).toBe(
          false
        )
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "knip.config.ts")).exists())
        ).toBe(false)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, ".vscode", "settings.json")).exists())
        ).toBe(false)
      })
    )
  })

  describe("non-interactive setup", () => {
    it.effect("configure the project entirely from flags without showing prompts", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
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

        const packageJson = yield* Effect.promise(() => readJson(join(tempDir, "package.json")))
        expect(packageJson.scripts).toEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
          format: "adamantite format",
        })
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxlint.config.ts")).exists())
        ).toBe(true)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxfmt.config.ts")).exists())
        ).toBe(true)
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "knip.config.ts")).exists())
        ).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "tsconfig.json")).exists())).toBe(
          true
        )
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, ".zed", "settings.json")).exists())
        ).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "AGENTS.md")).exists())).toBe(
          true
        )
        expect(
          yield* Effect.promise(() =>
            testFile(join(tempDir, ".github", "workflows", "adamantite.yml")).exists()
          )
        ).toBe(true)
      })
    )

    it.effect("treat omitted boolean flags as false and deduplicate repeated selections", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
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
        expect(yield* Effect.promise(() => testFile(join(tempDir, "tsconfig.json")).exists())).toBe(
          false
        )
        expect(yield* Effect.promise(() => testFile(join(tempDir, "AGENTS.md")).exists())).toBe(
          false
        )
        expect(
          yield* Effect.promise(() =>
            testFile(join(tempDir, ".github", "workflows", "adamantite.yml")).exists()
          )
        ).toBe(false)
      })
    )

    it.effect("configure every available script in a monorepo", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
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
        )

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
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

        const packageJson = yield* Effect.promise(() => readJson(join(tempDir, "package.json")))
        expect(packageJson.scripts).toEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
          "check:monorepo": "adamantite monorepo",
          fix: "adamantite fix",
          "fix:monorepo": "adamantite monorepo --fix",
          format: "adamantite format",
        })
      })
    )

    it.effect.each([
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
      {
        args: ["--overwrite-scripts"],
        name: "script overwriting without non-interactive mode",
        reason: "Setup flags require `--non-interactive`.",
      },
    ])("reject $name before changing the project", ({ args, reason }) =>
      Effect.gen(function* () {
        const originalPackageJson = yield* Effect.promise(() =>
          readFile(join(tempDir, "package.json"), "utf8")
        )
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, args, [prompter.layer, installer.layer])

        expect(Exit.isFailure(exit)).toBe(true)
        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
          _tag: "InvalidInitOptions",
          reason,
        })
        expect(installer.calls).toEqual([])
        expect(yield* Effect.promise(() => readFile(join(tempDir, "package.json"), "utf8"))).toBe(
          originalPackageJson
        )
      })
    )

    it.effect(
      "reject GitHub Actions with an unsupported package manager before changing the project",
      () =>
        Effect.gen(function* () {
          const originalPackageJson = yield* Effect.promise(() =>
            readFile(join(tempDir, "package.json"), "utf8")
          )
          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext({
            detectedPackageManager: { name: "aube" },
          })

          const exit = yield* runCommand(
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
          expect(yield* Effect.promise(() => readFile(join(tempDir, "package.json"), "utf8"))).toBe(
            originalPackageJson
          )
          expect(
            yield* Effect.promise(() =>
              testFile(join(tempDir, ".github", "workflows", "adamantite.yml")).exists()
            )
          ).toBe(false)
        })
    )

    it.effect("reject unknown selection values during CLI parsing", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "unknown"],
          [prompter.layer, installer.layer]
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(installer.calls).toEqual([])
      })
    )
  })

  describe("existing scripts", () => {
    const conflictingMonorepoPackageJson = JSON.stringify(
      {
        name: "test-project",
        scripts: {
          "check:monorepo": "sherif --ignore-dependency tailwindcss",
        },
        version: "1.0.0",
        workspaces: ["packages/*"],
      },
      null,
      2
    )

    it.effect("preserve conflicting scripts and warn in non-interactive mode", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "package.json"), conflictingMonorepoPackageJson)
        )

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check:monorepo", "--script", "fix:monorepo"],
          [prompter.layer, installer.layer]
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls).toEqual([])

        const packageJson = yield* Effect.promise(() =>
          readJson<{ scripts: Record<string, string> }>(join(tempDir, "package.json"))
        )
        expect(packageJson.scripts).toEqual({
          "check:monorepo": "sherif --ignore-dependency tailwindcss",
          "fix:monorepo": "adamantite monorepo --fix",
        })

        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Kept existing `check:monorepo` script (`sherif --ignore-dependency tailwindcss`) instead of `adamantite monorepo`. Use `--overwrite-scripts` to replace it.",
        })
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Adamantite commands forward extra arguments after `--`, so custom flags can be kept, e.g. `adamantite monorepo -- --ignore-dependency tailwindcss`.",
        })
      })
    )

    it.effect("replace conflicting scripts when --overwrite-scripts is passed", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "package.json"), conflictingMonorepoPackageJson)
        )

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          [
            "--non-interactive",
            "--script",
            "check:monorepo",
            "--script",
            "fix:monorepo",
            "--overwrite-scripts",
          ],
          [prompter.layer, installer.layer]
        )

        expect(Exit.isSuccess(exit)).toBe(true)

        const packageJson = yield* Effect.promise(() =>
          readJson<{ scripts: Record<string, string> }>(join(tempDir, "package.json"))
        )
        expect(packageJson.scripts).toEqual({
          "check:monorepo": "adamantite monorepo",
          "fix:monorepo": "adamantite monorepo --fix",
        })
        expect(prompter.logs).not.toContainEqual(
          expect.objectContaining({ message: expect.stringContaining("Kept existing") })
        )
      })
    )

    it.effect("replace conflicting scripts when overwriting is confirmed interactively", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "package.json"),
            JSON.stringify(
              {
                name: "test-project",
                scripts: { check: "tsc && eslint ." },
                version: "1.0.0",
              },
              null,
              2
            )
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "`check` is currently `tsc && eslint .`; Adamantite would replace it with `adamantite check`.",
        })
        expect(prompter.confirmCalls[0]).toMatchObject({
          message: "Overwrite this existing script with Adamantite's command?",
        })

        const packageJson = yield* Effect.promise(() =>
          readJson<{ scripts: Record<string, string> }>(join(tempDir, "package.json"))
        )
        expect(packageJson.scripts).toEqual({ check: "adamantite check" })
      })
    )

    it.effect("preserve conflicting scripts when overwriting is declined interactively", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "package.json"),
            JSON.stringify(
              {
                name: "test-project",
                scripts: { check: "tsc && eslint ." },
                version: "1.0.0",
              },
              null,
              2
            )
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)

        const packageJson = yield* Effect.promise(() =>
          readJson<{ scripts: Record<string, string> }>(join(tempDir, "package.json"))
        )
        expect(packageJson.scripts).toEqual({ check: "tsc && eslint ." })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Kept existing `check` script (`tsc && eslint .`) instead of `adamantite check`. Re-run `adamantite init` and confirm overwriting to replace it.",
        })
      })
    )

    it.effect(
      "do not prompt or warn when existing scripts already match the managed commands",
      () =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            writeFile(
              join(tempDir, "package.json"),
              JSON.stringify(
                {
                  name: "test-project",
                  scripts: { check: "adamantite check" },
                  version: "1.0.0",
                },
                null,
                2
              )
            )
          )

          // Only the typescript, CI, and agents confirms should fire; an overwrite
          // confirm would fail the run with a missing confirm response.
          const prompter = createPrompterTestContext({
            confirmResponses: [false, false, false],
            multiselectResponses: [["check"], [], []],
          })
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(prompter.logs).not.toContainEqual(
            expect.objectContaining({ message: expect.stringContaining("Kept existing") })
          )

          const packageJson = yield* Effect.promise(() =>
            readJson<{ scripts: Record<string, string> }>(join(tempDir, "package.json"))
          )
          expect(packageJson.scripts).toEqual({ check: "adamantite check" })
        })
    )

    it.effect("omit preserved scripts from AGENTS.md guidance", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "package.json"), conflictingMonorepoPackageJson)
        )

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check:monorepo", "--script", "format", "--agents"],
          [prompter.layer, installer.layer]
        )

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))
        expect(agents).toContain("Run `bun run format` after editing files")
        expect(agents).not.toContain("check:monorepo")
      })
    )
  })

  describe("agents guidance", () => {
    it.effect("adds script-specific Adamantite guidance to AGENTS.md when confirmed", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, true],
          multiselectResponses: [["check", "format", "analyze"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))
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
    )

    it.effect("uses the detected package manager in AGENTS.md guidance", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: { name: "npm" },
        })

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))
        expect(agents).toContain("Run `npm run format` after editing files")
      })
    )

    it.effect("appends Adamantite guidance to an existing AGENTS.md without markers", () =>
      Effect.gen(function* () {
        const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n"
        yield* Effect.promise(() => writeFile(join(tempDir, "AGENTS.md"), existingAgents))

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))
        expect(agents.startsWith(`${existingAgents}\n${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(
          true
        )
        expect(agents).toContain("## Adamantite")
        expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
      })
    )

    it.effect("replaces existing Adamantite guidance without duplicating markers", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "AGENTS.md"),
            `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nold content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))
        expect(agents).toContain("# Existing Instructions")
        expect(agents).toContain("Run `bun run analyze` after changing dependencies")
        expect(agents).not.toContain("old content")
        expect(countOccurrences(agents, ADAMANTITE_AGENTS_START_MARKER)).toBe(1)
        expect(countOccurrences(agents, ADAMANTITE_AGENTS_END_MARKER)).toBe(1)
      })
    )

    it.effect(
      "leaves AGENTS.md unchanged when Adamantite start marker is missing its end marker",
      () =>
        Effect.gen(function* () {
          const existingAgents = `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nmanual content\n`
          yield* Effect.promise(() => writeFile(join(tempDir, "AGENTS.md"), existingAgents))

          const prompter = createPrompterTestContext({
            confirmResponses: [false, true],
            multiselectResponses: [["format"], []],
          })
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(prompter.logs).toContainEqual({
            level: "warning",
            message:
              "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again.",
          })
          expect(yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))).toBe(
            existingAgents
          )
        })
    )

    it.effect(
      "leaves AGENTS.md unchanged when Adamantite end marker is missing its start marker",
      () =>
        Effect.gen(function* () {
          const existingAgents = `# Existing Instructions\n\nmanual content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
          yield* Effect.promise(() => writeFile(join(tempDir, "AGENTS.md"), existingAgents))

          const prompter = createPrompterTestContext({
            confirmResponses: [false, true],
            multiselectResponses: [["format"], []],
          })
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(prompter.logs).toContainEqual({
            level: "warning",
            message:
              "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again.",
          })
          expect(yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))).toBe(
            existingAgents
          )
        })
    )

    it.effect("leaves AGENTS.md unchanged when guidance is declined", () =>
      Effect.gen(function* () {
        const existingAgents = "# Existing Instructions\n"
        yield* Effect.promise(() => writeFile(join(tempDir, "AGENTS.md"), existingAgents))

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(yield* Effect.promise(() => readFile(join(tempDir, "AGENTS.md"), "utf8"))).toBe(
          existingAgents
        )
      })
    )

    it.effect("continues initialization when AGENTS.md cannot be read", () =>
      Effect.gen(function* () {
        const agentsPath = join(tempDir, "AGENTS.md")
        yield* Effect.promise(() => mkdir(agentsPath))

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

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
    )

    it.effect("gracefully handles AGENTS.md prompt cancellation", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          cancelAtPromptIndex: 4,
          confirmResponses: [false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.cancels).toEqual(["You've cancelled the initialization process."])
        expect(prompter.outros).toEqual([])
        expect(installer.calls).toEqual([])
        expect(yield* Effect.promise(() => testFile(join(tempDir, "AGENTS.md")).exists())).toBe(
          false
        )
      })
    )
  })

  describe("dual-config warnings", () => {
    it.effect("warn when both legacy and modern knip configs exist", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "knip.config.ts"),
            'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = { entry: ["src/index.ts"] }\n\nexport default config\n'
          )
        )
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "knip.json"), JSON.stringify({ entry: ["src/main.ts"] }, null, 2))
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
        })
        expect(yield* Effect.promise(() => testFile(join(tempDir, "knip.json")).exists())).toBe(
          true
        )
      })
    )

    it.effect("warn when both legacy and modern oxfmt configs exist", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "oxfmt.config.ts"),
            'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({ semi: false })\n'
          )
        )
        yield* Effect.promise(() =>
          writeFile(join(tempDir, ".oxfmtrc.json"), JSON.stringify({ semi: true }, null, 2))
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
        })
        expect(yield* Effect.promise(() => testFile(join(tempDir, ".oxfmtrc.json")).exists())).toBe(
          true
        )
      })
    )

    it.effect("warn when both legacy and modern oxlint configs exist", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, "oxlint.config.ts"),
            'export default { rules: { curly: "error" } }\n'
          )
        )
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".oxlintrc.json"),
            JSON.stringify({ rules: { semi: "error" } }, null, 2)
          )
        )

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
        })
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, ".oxlintrc.json")).exists())
        ).toBe(true)
      })
    )
  })

  describe("edge cases", () => {
    it.effect("fail when no package manager can be detected", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: null,
        })

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "NoPackageManager" })
      })
    )

    it.effect("create a GitHub Actions workflow for CI-compatible scripts when requested", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [true, true, true, false],
          multiselectResponses: [["check", "format"], ["react"], ["zed"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

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
        expect(yield* Effect.promise(() => testFile(workflowPath).exists())).toBe(true)

        const workflow = yield* Effect.promise(() => readFile(workflowPath, "utf8"))
        expect(workflow).toContain("oven-sh/setup-bun@v2")
        expect(workflow).toContain("name: check")
        expect(workflow).toContain("name: format")
        expect(workflow).toContain("command: bun run check")
        expect(workflow).toContain("command: bun run format --check")
      })
    )

    it.effect("skip tsconfig setup when the user declines the TypeScript preset prompt", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

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
        expect(
          yield* Effect.promise(() => testFile(join(tempDir, "oxlint.config.ts")).exists())
        ).toBe(true)
        expect(yield* Effect.promise(() => testFile(join(tempDir, "tsconfig.json")).exists())).toBe(
          false
        )
      })
    )

    it.effect("gracefully handle prompt cancellation", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          cancelAtPromptIndex: 1,
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], [prompter.layer, installer.layer])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.cancels).toEqual(["You've cancelled the initialization process."])
        expect(prompter.outros).toEqual([])
        expect(installer.calls).toEqual([])
      })
    )

    it.effect("continue successfully and show the exit code when the extension install fails", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["format"], ["vscode"]],
        })
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext({
          implementation: (options) =>
            Effect.succeed(ChildProcessSpawner.ExitCode(options.command === "code" ? 1 : 0)),
        })

        const exit = yield* runCommand(
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
    )

    it.effect("continue successfully and show guidance when the VS Code CLI is unavailable", () =>
      Effect.gen(function* () {
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

        const exit = yield* runCommand(
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

        expect(
          yield* Effect.promise(() => testFile(join(tempDir, ".vscode", "settings.json")).exists())
        ).toBe(true)
      })
    )
  })
})
