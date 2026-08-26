import type { JsonObject } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
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

const basePackageJson = JSON.stringify(
  {
    name: "test-project",
    version: "1.0.0",
  },
  null,
  2
)

const monorepoPackageJson = JSON.stringify(
  {
    name: "test-project",
    version: "1.0.0",
    workspaces: ["packages/*"],
  },
  null,
  2
)

function createInitTestContext(files?: Record<string, string>) {
  return createFileSystemTestContext({
    files: { "package.json": basePackageJson, ...files },
  })
}

function readJson(files: FileSystemTestContext, path: string): JsonObject {
  // SAFETY: every caller asserts the shape of a JSON fixture this test suite wrote itself.
  return JSON.parse(files.read(path)) as JsonObject
}

function countOccurrences(content: string, search: string) {
  return content.split(search).length - 1
}

describe("init", () => {
  describe("fresh project setup", () => {
    it.effect("set up the selected files, scripts, and dependencies", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check", "format", "analyze"], ["react"], ["vscode"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

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

        const packageJson = readJson(files, "package.json")
        expect(packageJson.scripts).toEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
          format: "adamantite format",
        })

        const oxlintConfig = files.read("oxlint.config.ts")
        expect(oxlintConfig).toContain('import react from "adamantite/lint/react"')
        expect(oxlintConfig).toContain('"respectEslintDisableDirectives": true')
        expect(oxlintConfig).toContain('"typeAware": true')
        expect(oxlintConfig).toContain('"typeCheck": true')

        const oxfmtConfig = files.read("oxfmt.config.ts")
        expect(oxfmtConfig).toContain('import { defineConfig } from "oxfmt"')
        expect(oxfmtConfig).toContain('import format from "adamantite/format"')
        expect(oxfmtConfig).toContain("export default defineConfig(format)")

        // SAFETY: this test wrote the tsconfig fixture and asserts its shape.
        const tsconfig = readJson(files, "tsconfig.json") as { extends: string }
        expect(tsconfig.extends).toBe("adamantite/typescript")

        const vscodeSettings = readJson(files, ".vscode/settings.json")
        expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")

        const knipConfig = files.read("knip.config.ts")
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
        const files = createInitTestContext({
          ".oxlintrc.json": JSON.stringify(
            {
              extends: ["adamantite/lint/node"],
              rules: { semi: "error" },
            },
            null,
            2
          ),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["check"], ["react"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists(".oxlintrc.json")).toBe(true)
        expect(files.exists("oxlint.config.ts")).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `.oxlintrc.json` was preserved during `adamantite init`. Run `adamantite doctor` and follow its findings to migrate it to the latest oxlint config.",
        })

        const oxlintConfig = files.read(".oxlintrc.json")
        expect(oxlintConfig).toContain('"semi": "error"')
      })
    )
  })

  describe("oxfmt config handling", () => {
    it.effect("keep a legacy oxfmt config in place during init", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          ".oxfmtrc.json": JSON.stringify(
            {
              semi: true,
            },
            null,
            2
          ),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists(".oxfmtrc.json")).toBe(true)
        expect(files.exists("oxfmt.config.ts")).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `.oxfmtrc.json` was preserved during `adamantite init`. Run `adamantite doctor` and follow its findings to migrate it to the latest oxfmt config.",
        })

        const oxfmtConfig = files.read(".oxfmtrc.json")
        expect(oxfmtConfig).toContain('"semi": true')
      })
    )
  })

  describe("knip config handling", () => {
    it.effect("keep a legacy knip config in place during init", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "knip.jsonc": [
            "{",
            '  "entry": ["src/index.ts"],',
            '  "ignore": ["bunup.config.ts"],',
            "}",
            "",
          ].join("\n"),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists("knip.jsonc")).toBe(true)
        expect(files.exists("knip.config.ts")).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `knip.jsonc` was preserved during `adamantite init`. Run `adamantite doctor` and follow its findings to migrate it to the latest knip config.",
        })

        const knipConfig = files.read("knip.jsonc")
        expect(knipConfig).toContain('"src/index.ts"')
        expect(knipConfig).toContain('"bunup.config.ts"')
      })
    )

    it.effect("keep legacy knip configs in place when both knip.json and knip.jsonc exist", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "knip.json": JSON.stringify({ entry: ["src/other.ts"] }, null, 2),
          "knip.jsonc": [
            "{",
            '  "entry": ["src/index.ts"],',
            '  "ignore": ["bunup.config.ts"],',
            "}",
            "",
          ].join("\n"),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth in its findings.",
        })
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Legacy `knip.jsonc` was preserved during `adamantite init`. Run `adamantite doctor` and follow its findings to migrate it to the latest knip config.",
        })
        expect(files.exists("knip.json")).toBe(true)
        expect(files.exists("knip.jsonc")).toBe(true)
        expect(files.exists("knip.config.ts")).toBe(false)
      })
    )
  })

  describe("workspace installation", () => {
    it.effect("use workspace installation when the project is a monorepo", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": monorepoPackageJson })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["check:monorepo"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

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

    it.effect("print guidance instead of creating a root tsconfig in a monorepo", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": monorepoPackageJson })
        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists("tsconfig.json")).toBe(false)

        for (const log of monorepoGuidanceLogs) {
          expect(prompter.logs).toContainEqual(log)
        }
      })
    )

    it.effect("print guidance instead of creating a root tsconfig in non-interactive mode", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": monorepoPackageJson })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--typescript"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists("tsconfig.json")).toBe(false)

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
        const files = createInitTestContext({
          "package.json": monorepoPackageJson,
          "tsconfig.json": existingTsconfig,
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--typescript"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("tsconfig.json")).toBe(existingTsconfig)
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
        const files = createInitTestContext({
          ".vscode/settings.json": JSON.stringify({ "editor.tabSize": 4 }, null, 2),
          "oxfmt.config.ts": originalOxfmtConfig,
          "tsconfig.json": JSON.stringify(
            {
              compilerOptions: {
                paths: {
                  "@/*": ["src/*"],
                },
              },
            },
            null,
            2
          ),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check", "format"], [], ["vscode"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        const oxfmtConfig = files.read("oxfmt.config.ts")
        expect(oxfmtConfig).toBe(originalOxfmtConfig)

        // SAFETY: this test wrote the tsconfig fixture and asserts its shape.
        const tsconfig = readJson(files, "tsconfig.json") as {
          compilerOptions: {
            paths: Record<string, string[]>
          }
          extends: string
        }
        expect(tsconfig.extends).toBe("adamantite/typescript")
        expect(tsconfig.compilerOptions.paths).toEqual({
          "@/*": ["src/*"],
        })

        const vscodeSettings = readJson(files, ".vscode/settings.json")
        expect(vscodeSettings["editor.tabSize"]).toBe(4)
        expect(vscodeSettings["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")
        expect(files.exists("oxlint.config.ts")).toBe(true)
      })
    )
  })

  describe("selective setup", () => {
    it.effect("apply only the requested scripts and editor setup", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["format"], ["zed"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toEqual([
          {
            options: { silent: true, workspace: false },
            packages: ["adamantite", `oxfmt@${oxfmt.version}`],
          },
        ])

        const packageJson = readJson(files, "package.json")
        expect(packageJson.scripts).toEqual({
          format: "adamantite format",
        })

        expect(files.exists("oxfmt.config.ts")).toBe(true)
        expect(files.exists(".zed/settings.json")).toBe(true)
        expect(files.exists("oxlint.config.ts")).toBe(false)
        expect(files.exists("tsconfig.json")).toBe(false)
        expect(files.exists("knip.config.ts")).toBe(false)
        expect(files.exists(".vscode/settings.json")).toBe(false)
      })
    )
  })

  describe("non-interactive setup", () => {
    it.effect("configure the project entirely from flags without showing prompts", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
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
          { files, layers: [prompter.layer, installer.layer] }
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

        const packageJson = readJson(files, "package.json")
        expect(packageJson.scripts).toEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
          format: "adamantite format",
        })
        expect(files.exists("oxlint.config.ts")).toBe(true)
        expect(files.exists("oxfmt.config.ts")).toBe(true)
        expect(files.exists("knip.config.ts")).toBe(true)
        expect(files.exists("tsconfig.json")).toBe(true)
        expect(files.exists(".zed/settings.json")).toBe(true)
        expect(files.exists("AGENTS.md")).toBe(true)
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(true)
      })
    )

    it.effect("treat omitted boolean flags as false and deduplicate repeated selections", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "format", "--script", "format"],
          { files, layers: [prompter.layer, installer.layer] }
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
        expect(files.exists("tsconfig.json")).toBe(false)
        expect(files.exists("AGENTS.md")).toBe(false)
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
      })
    )

    it.effect("configure every available script in a monorepo", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": monorepoPackageJson })

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
          { files, layers: [prompter.layer, installer.layer] }
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

        const packageJson = readJson(files, "package.json")
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
        const files = createInitTestContext()
        const originalPackageJson = files.read("package.json")
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, args, {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
          _tag: "InvalidInitOptions",
          reason,
        })
        expect(installer.calls).toEqual([])
        expect(files.read("package.json")).toBe(originalPackageJson)
      })
    )

    it.effect(
      "reject GitHub Actions with an unsupported package manager before changing the project",
      () =>
        Effect.gen(function* () {
          const files = createInitTestContext()
          const originalPackageJson = files.read("package.json")
          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext({
            detectedPackageManager: { name: "aube" },
          })

          const exit = yield* runCommand(
            initCommand,
            ["--non-interactive", "--script", "check", "--github-actions"],
            { files, layers: [prompter.layer, installer.layer] }
          )

          expect(Exit.isFailure(exit)).toBe(true)
          expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
            _tag: "InvalidInitOptions",
            reason:
              "`--github-actions` does not support the detected package manager `aube`. Use bun, deno, npm, pnpm, or yarn.",
          })
          expect(installer.calls).toEqual([])
          expect(files.read("package.json")).toBe(originalPackageJson)
          expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
        })
    )

    it.effect("reject unknown selection values during CLI parsing", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "unknown"], {
          files,
          layers: [prompter.layer, installer.layer],
        })

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
        const files = createInitTestContext({
          "package.json": conflictingMonorepoPackageJson,
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check:monorepo", "--script", "fix:monorepo"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls).toEqual([])

        // SAFETY: this test wrote the package.json fixture and asserts its scripts shape.
        const packageJson = readJson(files, "package.json") as {
          scripts: Record<string, string>
        }
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
        const files = createInitTestContext({
          "package.json": conflictingMonorepoPackageJson,
        })

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
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)

        // SAFETY: this test wrote the package.json fixture and asserts its scripts shape.
        const packageJson = readJson(files, "package.json") as {
          scripts: Record<string, string>
        }
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
        const files = createInitTestContext({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: { check: "tsc && eslint ." },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "`check` is currently `tsc && eslint .`; Adamantite would replace it with `adamantite check`.",
        })
        expect(prompter.confirmCalls[0]).toMatchObject({
          message: "Overwrite this existing script with Adamantite's command?",
        })

        // SAFETY: this test wrote the package.json fixture and asserts its scripts shape.
        const packageJson = readJson(files, "package.json") as {
          scripts: Record<string, string>
        }
        expect(packageJson.scripts).toEqual({ check: "adamantite check" })
      })
    )

    it.effect("preserve conflicting scripts when overwriting is declined interactively", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": JSON.stringify(
            {
              name: "test-project",
              scripts: { check: "tsc && eslint ." },
              version: "1.0.0",
            },
            null,
            2
          ),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        // SAFETY: this test wrote the package.json fixture and asserts its scripts shape.
        const packageJson = readJson(files, "package.json") as {
          scripts: Record<string, string>
        }
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
          const files = createInitTestContext({
            "package.json": JSON.stringify(
              {
                name: "test-project",
                scripts: { check: "adamantite check" },
                version: "1.0.0",
              },
              null,
              2
            ),
          })

          // Only the typescript, CI, and agents confirms should fire; an overwrite
          // confirm would fail the run with a missing confirm response.
          const prompter = createPrompterTestContext({
            confirmResponses: [false, false, false],
            multiselectResponses: [["check"], [], []],
          })
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, [], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(prompter.logs).not.toContainEqual(
            expect.objectContaining({ message: expect.stringContaining("Kept existing") })
          )

          // SAFETY: this test wrote the package.json fixture and asserts its scripts shape.
          const packageJson = readJson(files, "package.json") as {
            scripts: Record<string, string>
          }
          expect(packageJson.scripts).toEqual({ check: "adamantite check" })
        })
    )

    it.effect("omit preserved scripts from AGENTS.md guidance", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": conflictingMonorepoPackageJson,
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check:monorepo", "--script", "format", "--agents"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = files.read("AGENTS.md")
        expect(agents).toContain("Run `bun run format` after editing files")
        expect(agents).not.toContain("check:monorepo")
      })
    )
  })

  describe("agents guidance", () => {
    it.effect("adds script-specific Adamantite guidance to AGENTS.md when confirmed", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, true],
          multiselectResponses: [["check", "format", "analyze"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = files.read("AGENTS.md")
        expect(agents).toContain(ADAMANTITE_AGENTS_START_MARKER)
        expect(agents).toContain("## Adamantite")
        expect(agents).toContain("Run `bun run format` after editing files")
        expect(agents).toContain("Run `bun run check` to catch lint and type issues")
        expect(agents).toContain("Run `bun run analyze` after changing dependencies")
        expect(agents).toContain("adamantite doctor")
        expect(agents).not.toContain("adamantite fix")
        expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
        expect(agents.endsWith("\n")).toBe(true)
      })
    )

    it.effect("uses the detected package manager in AGENTS.md guidance", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: { name: "npm" },
        })

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = files.read("AGENTS.md")
        expect(agents).toContain("Run `npm run format` after editing files")
      })
    )

    it.effect("appends Adamantite guidance to an existing AGENTS.md without markers", () =>
      Effect.gen(function* () {
        const existingAgents = "# Existing Instructions\n\nKeep project guidance here.\n"
        const files = createInitTestContext({ "AGENTS.md": existingAgents })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = files.read("AGENTS.md")
        expect(agents.startsWith(`${existingAgents}\n${ADAMANTITE_AGENTS_START_MARKER}\n`)).toBe(
          true
        )
        expect(agents).toContain("## Adamantite")
        expect(agents).toContain(ADAMANTITE_AGENTS_END_MARKER)
      })
    )

    it.effect("replaces existing Adamantite guidance without duplicating markers", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "AGENTS.md": `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nold content\n${ADAMANTITE_AGENTS_END_MARKER}\n`,
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = files.read("AGENTS.md")
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
          const files = createInitTestContext({ "AGENTS.md": existingAgents })

          const prompter = createPrompterTestContext({
            confirmResponses: [false, true],
            multiselectResponses: [["format"], []],
          })
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, [], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(prompter.logs).toContainEqual({
            level: "warning",
            message:
              "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again.",
          })
          expect(files.read("AGENTS.md")).toBe(existingAgents)
        })
    )

    it.effect(
      "leaves AGENTS.md unchanged when Adamantite end marker is missing its start marker",
      () =>
        Effect.gen(function* () {
          const existingAgents = `# Existing Instructions\n\nmanual content\n${ADAMANTITE_AGENTS_END_MARKER}\n`
          const files = createInitTestContext({ "AGENTS.md": existingAgents })

          const prompter = createPrompterTestContext({
            confirmResponses: [false, true],
            multiselectResponses: [["format"], []],
          })
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, [], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(prompter.logs).toContainEqual({
            level: "warning",
            message:
              "Could not update AGENTS.md because Adamantite markers are incomplete. Remove the stale ADAMANTITE marker and run adamantite init again.",
          })
          expect(files.read("AGENTS.md")).toBe(existingAgents)
        })
    )

    it.effect("leaves AGENTS.md unchanged when guidance is declined", () =>
      Effect.gen(function* () {
        const existingAgents = "# Existing Instructions\n"
        const files = createInitTestContext({ "AGENTS.md": existingAgents })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("AGENTS.md")).toBe(existingAgents)
      })
    )

    it.effect("continues initialization when AGENTS.md cannot be read", () =>
      Effect.gen(function* () {
        // Seeding a file beneath AGENTS.md turns it into a directory, so reading
        // it fails exactly like the old mkdir-based fixture on the real filesystem.
        const files = createInitTestContext({ "AGENTS.md/placeholder": "" })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

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
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          cancelAtPromptIndex: 4,
          confirmResponses: [false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.cancels).toEqual(["You've cancelled the initialization process."])
        expect(prompter.outros).toEqual([])
        expect(installer.calls).toEqual([])
        expect(files.exists("AGENTS.md")).toBe(false)
      })
    )
  })

  describe("dual-config warnings", () => {
    it.effect("warn when both legacy and modern knip configs exist", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "knip.config.ts":
            'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = { entry: ["src/index.ts"] }\n\nexport default config\n',
          "knip.json": JSON.stringify({ entry: ["src/main.ts"] }, null, 2),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["analyze"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`.",
        })
        expect(files.exists("knip.json")).toBe(true)
      })
    )

    it.effect("warn when both legacy and modern oxfmt configs exist", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          ".oxfmtrc.json": JSON.stringify({ semi: true }, null, 2),
          "oxfmt.config.ts":
            'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({ semi: false })\n',
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [["format"], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`.",
        })
        expect(files.exists(".oxfmtrc.json")).toBe(true)
      })
    )

    it.effect("warn when both legacy and modern oxlint configs exist", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          ".oxlintrc.json": JSON.stringify({ rules: { semi: "error" } }, null, 2),
          "oxlint.config.ts": 'export default { rules: { curly: "error" } }\n',
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`.",
        })
        expect(files.exists(".oxlintrc.json")).toBe(true)
      })
    )
  })

  describe("edge cases", () => {
    it.effect("fail when no package manager can be detected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: null,
        })

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "NoPackageManager" })
      })
    )

    it.effect("create a GitHub Actions workflow for CI-compatible scripts when requested", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [true, true, true, false],
          multiselectResponses: [["check", "format"], ["react"], ["zed"]],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

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

        const workflowPath = ".github/workflows/adamantite.yml"
        expect(files.exists(workflowPath)).toBe(true)

        const workflow = files.read(workflowPath)
        expect(workflow).toContain("oven-sh/setup-bun@v2")
        expect(workflow).toContain("name: check")
        expect(workflow).toContain("name: format")
        expect(workflow).toContain("command: bun run check")
        expect(workflow).toContain("command: bun run format --check")
      })
    )

    it.effect("continues initialization when the GitHub Actions workflow cannot be written", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const workflowPath = ".github/workflows/adamantite.yml"
        files.makeReadOnly(workflowPath)

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists(workflowPath)).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: expect.stringMatching(
            /Could not set up the GitHub Actions workflow\. Failed to write `.*adamantite\.yml`\./
          ),
        })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Fix the reported problem and run `adamantite init` again, or create the workflow manually.",
        })
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Your project is now configured",
        })
        expect(prompter.outros).toEqual(["💠 Adamantite initialized successfully!"])
      })
    )

    it.effect("skip tsconfig setup when the user declines the TypeScript preset prompt", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["check"], [], []],
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

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
        expect(files.exists("oxlint.config.ts")).toBe(true)
        expect(files.exists("tsconfig.json")).toBe(false)
      })
    )

    it.effect("gracefully handle prompt cancellation", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          cancelAtPromptIndex: 1,
        })
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files: createInitTestContext(),
          layers: [prompter.layer, installer.layer],
        })

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

        const exit = yield* runCommand(initCommand, [], {
          files: createInitTestContext(),
          layers: [prompter.layer, installer.layer, runner.layer],
        })

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
        const files = createInitTestContext()
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

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer, runner.layer],
        })

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

        expect(files.exists(".vscode/settings.json")).toBe(true)
      })
    )
  })
})
