import type { JsonObject } from "type-fest"
import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import type { InitEditor, InitOptions } from "#commands/init/options.ts"
import type { LintPreset } from "#lib/integrations/tooling/oxlint/presets.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import initCommand from "#commands/init/index.ts"
import { installEditorExtensions, setupEditors } from "#commands/init/setup.ts"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts"
import { toKnipTsConfigContent } from "#lib/integrations/tooling/knip/config.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import { getImportedLintPresets } from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { LINT_PRESETS } from "#lib/integrations/tooling/oxlint/presets.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { CliNotFound, InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { ADAMANTITE_AGENTS_START_MARKER } from "#lib/workspace/agents.ts"
import {
  createDependencyInstallerTestContext,
  createRunnerTestContext,
  createPrompterTestContext,
  runCommand,
} from "./command-test-helpers.ts"

const effectTsgo = managedPlugin("@effect/tsgo")
const shadcnLint = managedPlugin("@shadcn/lint")
const reactDoctor = managedPlugin("oxlint-plugin-react-doctor")

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

// Interactive init probes the coding agent CLIs for the skill prompt. None of them is installed.

const shippedSkill = getShippedSkillFiles()

function createInitTestContext(files?: Record<string, string>) {
  return createFileSystemTestContext({
    files: { "package.json": basePackageJson, ...files },
  })
}

function readJson(files: FileSystemTestContext, path: string): JsonObject {
  // SAFETY: every caller asserts the shape of a JSON fixture this test suite wrote itself.
  return JSON.parse(files.read(path)) as JsonObject
}

function readOptionalFile(files: FileSystemTestContext, path: string): string | null {
  return files.exists(path) ? files.read(path) : null
}

const EXISTING_MONOREPO_TSCONFIG = JSON.stringify(
  {
    extends: "./tooling/tsconfig.base.json",
    files: [],
    references: [{ path: "packages/app" }],
  },
  null,
  2
)

// Runs init interactively with the check and analyze scripts, the react preset, and VS Code.
function runFreshSetup() {
  return Effect.gen(function* () {
    const files = createInitTestContext()

    const prompter = createPrompterTestContext({
      confirmResponses: [true, false, false, false],
      multiselectResponses: [["check", "analyze"], ["react"], ["vscode"]],
      selectResponses: ["typescript"],
    })

    const installer = createDependencyInstallerTestContext()

    const exit = yield* runCommand(initCommand, [], {
      files,
      layers: [prompter.layer, installer.layer],
    })

    return { exit, files, installer, prompter }
  })
}

// Runs init non-interactively with the check script, the effect preset, and TypeScript.
function runEffectSetup() {
  return Effect.gen(function* () {
    const files = createInitTestContext()
    const prompter = createPrompterTestContext()
    const installer = createDependencyInstallerTestContext()
    const runner = createRunnerTestContext()

    const exit = yield* runCommand(
      initCommand,
      [
        "--non-interactive",
        "--script",
        "check",
        "--preset",
        "effect",
        "--typescript",
        "typescript",
      ],
      { files, layers: [prompter.layer, installer.layer, runner.layer] }
    )

    return { exit, files, installer, runner }
  })
}

describe("init", () => {
  describe("fresh project setup", () => {
    it.effect("install the managed packages and add the selected scripts", () =>
      Effect.gen(function* () {
        const { exit, files, installer } = yield* runFreshSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toStrictEqual([
          {
            options: { silent: true, workspace: false },
            packages: [
              "adamantite",
              `oxlint@${oxlint.version}`,
              `tsrs@${tsrs.version}`,
              `oxfmt@${oxfmt.version}`,
              `knip@${knip.version}`,
            ],
          },
        ])
        expect(readJson(files, "package.json").scripts).toStrictEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
        })
      })
    )

    it.effect("write the configs for the selected tools, preset, and editor", () =>
      Effect.gen(function* () {
        const { exit, files } = yield* runFreshSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.list()).toStrictEqual([
          ".vscode/settings.json",
          "knip.config.ts",
          "oxfmt.config.ts",
          "oxlint.config.ts",
          "package.json",
          "tsconfig.json",
        ])
        expect({
          "knip.config.ts": files.read("knip.config.ts"),
          "oxfmt.config.ts": files.read("oxfmt.config.ts"),
          presets: getImportedLintPresets(files.read("oxlint.config.ts")),
        }).toStrictEqual({
          "knip.config.ts": toKnipTsConfigContent(),
          "oxfmt.config.ts": toOxfmtTsConfigContent(),
          presets: ["react"],
        })
        expect(readJson(files, "tsconfig.json")).toMatchObject({ extends: "adamantite/typescript" })
        expect(readJson(files, ".vscode/settings.json")).toMatchObject({
          "editor.defaultFormatter": "oxc.oxc-vscode",
        })
      })
    )
  })

  it.effect("offer every selectable lint preset in interactive init", () =>
    Effect.gen(function* () {
      const { prompter } = yield* runFreshSetup()

      expect(prompter.multiselectCalls[1]).toMatchObject({
        options: LINT_PRESETS.map((value) => ({ value })),
      })
    })
  )

  describe("legacy config handling", () => {
    it.effect.each([
      {
        content: JSON.stringify({ extends: ["adamantite/lint/node"], rules: { semi: "error" } }),
        legacyConfig: ".oxlintrc.json",
        modernConfig: "oxlint.config.ts",
        script: "check",
        tool: "oxlint",
      },
      {
        content: JSON.stringify({ semi: true }),
        legacyConfig: ".oxfmtrc.json",
        modernConfig: "oxfmt.config.ts",
        script: "check",
        tool: "oxfmt",
      },
      {
        content: '{\n  "entry": ["src/index.ts"],\n  "ignore": ["bunup.config.ts"],\n}\n',
        legacyConfig: "knip.jsonc",
        modernConfig: "knip.config.ts",
        script: "analyze",
        tool: "knip",
      },
    ])(
      "keep a legacy $tool config in place during init",
      ({ content, legacyConfig, modernConfig, script, tool }) =>
        Effect.gen(function* () {
          const files = createInitTestContext({ [legacyConfig]: content })
          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", script], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(files.read(legacyConfig)).toBe(content)
          expect(files.exists(modernConfig)).toBe(false)
          expect(prompter.logs).toContainEqual({
            level: "info",
            message: `Legacy \`${legacyConfig}\` was kept during \`adamantite init\`. Run \`adamantite doctor\` for instructions to migrate to the current ${tool} config.`,
          })
        })
    )
  })

  it.effect("configure the first-party plugin presets without extra packages", () =>
    Effect.gen(function* () {
      const files = createInitTestContext({ "package.json": basePackageJson })
      const prompter = createPrompterTestContext()
      const installer = createDependencyInstallerTestContext()

      const exit = yield* runCommand(
        initCommand,
        [
          "--non-interactive",
          "--script",
          "check",
          "--preset",
          "architecture",
          "--preset",
          "strict",
          "--preset",
          "tanstack",
        ],
        { files, layers: [prompter.layer, installer.layer] }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(getImportedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual([
        "architecture",
        "strict",
        "tanstack",
      ])
      expect(installer.calls[0]?.packages).toStrictEqual(
        expect.not.arrayContaining([expect.stringMatching(/architecture|strict|tanstack/)])
      )
    })
  )

  describe("managed lint plugins", () => {
    it.effect("install @shadcn/lint when the tailwind preset is selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": basePackageJson })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "tailwind"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toContain(`@shadcn/lint@${shadcnLint.version}`)
        expect(files.read("oxlint.config.ts")).toContain(
          'import tailwind from "adamantite/lint/tailwind"'
        )
      })
    )

    it.effect("install oxlint-plugin-react-doctor when the react-strict preset is selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": basePackageJson })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          [
            "--non-interactive",
            "--script",
            "check",
            "--preset",
            "react",
            "--preset",
            "react-strict",
          ],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toContain(
          `oxlint-plugin-react-doctor@${reactDoctor.version}`
        )
        expect(files.read("oxlint.config.ts")).toContain(
          'import reactStrict from "adamantite/lint/react-strict"'
        )
      })
    )

    it.effect("install @effect/tsgo for effect, and write no prepare script or patch", () =>
      Effect.gen(function* () {
        const { exit, files, installer, runner } = yield* runEffectSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toContain(`@effect/tsgo@${effectTsgo.version}`)
        expect(readJson(files, "package.json")).not.toHaveProperty("scripts.prepare")
        expect(runner.invocations).toStrictEqual([])
      })
    )

    it.effect("configure the effect preset and the language service for effect", () =>
      Effect.gen(function* () {
        const { exit, files } = yield* runEffectSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(getImportedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual(["effect"])
        expect(readJson(files, "tsconfig.json")).toStrictEqual({
          compilerOptions: {
            plugins: [{ diagnostics: true, name: "@effect/language-service" }],
          },
          extends: "adamantite/typescript",
        })
      })
    )

    it.effect("ignore the language service plugin name in a new knip config", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--script", "analyze", "--preset", "effect"],
          { files, layers: [prompter.layer, installer.layer, runner.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("knip.config.ts")).toContain(
          "ignoreDependencies: ignoreDependencies.effect,"
        )
      })
    )

    it.effect("keep an existing prepare script, and warn about the missing tsconfig.json", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { prepare: "husky" },
          }),
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "effect"],
          { files, layers: [prompter.layer, installer.layer, runner.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(readJson(files, "package.json")).toMatchObject({ scripts: { prepare: "husky" } })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "No `tsconfig.json` found, so the Effect language service is not configured. Run `adamantite doctor` for the reference entry.",
        })
      })
    )

    it.effect("give tsconfig guidance instead of editing it in a monorepo", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": monorepoPackageJson,
          "tsconfig.json": "{}",
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "effect"],
          { files, layers: [prompter.layer, installer.layer, runner.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("tsconfig.json")).toBe("{}")
        expect(prompter.logs).toContainEqual({
          level: "info",
          message: expect.stringContaining("In a monorepo, add the Effect language service entry"),
        })
      })
    )

    it.effect("add the react preset when react-strict is selected without it", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["check"], ["react-strict"], []],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("oxlint.config.ts")).toContain(
          'import react from "adamantite/lint/react"'
        )
        expect(prompter.logs).toContainEqual({
          level: "info",
          message: "Added the `react` preset, which `react-strict` requires.",
        })
      })
    )

    it.effect("keep one of the jest and vitest presets when both are selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["check"], ["jest", "vitest", "strict"], []],
          selectResponses: ["vitest"],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.selectCalls[0]).toMatchObject({
          message:
            "The jest and vitest presets report the same defects. Which one should Adamantite use?",
          options: [
            { label: "jest", value: "jest" },
            { label: "vitest", value: "vitest" },
          ],
        })
        expect(getImportedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual([
          "vitest",
          "strict",
        ])
      })
    )
  })

  describe("sherif for analyze", () => {
    it.effect("install sherif with the analyze script in a monorepo", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": monorepoPackageJson })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "analyze"], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toStrictEqual([
          "adamantite",
          `sherif@${sherif.version}`,
          `knip@${knip.version}`,
        ])
        expect(files.read("knip.config.ts")).toContain(
          "ignoreDependencies: ignoreDependencies.monorepo"
        )
      })
    )
  })

  describe("workspace installation", () => {
    for (const { name, workspace } of [
      { name: "npm", workspace: false },
      { name: "pnpm", workspace: true },
      { name: "yarn", workspace: true },
      { name: "bun", workspace: true },
    ] as const) {
      it.effect(`install at the monorepo root with ${name}`, () =>
        Effect.gen(function* () {
          const files = createInitTestContext({ "package.json": monorepoPackageJson })
          const prompter = createPrompterTestContext()

          const installer = createDependencyInstallerTestContext({
            detectedPackageManager: { name },
          })

          const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "check"], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(installer.calls.map((call) => call.options)).toStrictEqual([
            { silent: true, workspace },
          ])
        })
      )
    }
  })

  describe("monorepo TypeScript setup", () => {
    it.effect.each<{
      readonly files: Record<string, string>
      readonly name: string
      readonly tsconfig: string | null
    }>([
      { files: {}, name: "no root tsconfig.json", tsconfig: null },
      {
        files: { "tsconfig.json": EXISTING_MONOREPO_TSCONFIG },
        name: "an existing root tsconfig.json",
        tsconfig: EXISTING_MONOREPO_TSCONFIG,
      },
    ])("leave $name as it is and print guidance in a monorepo", ({ files: rootFiles, tsconfig }) =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": monorepoPackageJson, ...rootFiles })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--typescript", "typescript"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(readOptionalFile(files, "tsconfig.json")).toBe(tsconfig)
        expect(prompter.logs).toStrictEqual(
          expect.arrayContaining([
            {
              level: "info",
              message: "Adamantite leaves the root `tsconfig.json` unchanged in a monorepo.",
            },
            {
              level: "info",
              message:
                'Add `"extends": "adamantite/typescript"` to each package\'s `tsconfig.json` or to a shared base config.',
            },
            {
              level: "info",
              message: "In a library package, extend `adamantite/tsconfig` instead.",
            },
          ])
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

        const files = createInitTestContext({
          ".vscode/settings.json": yield* formatJson({ "editor.tabSize": 4 }),
          "oxfmt.config.ts": originalOxfmtConfig,
          "tsconfig.json": yield* formatJson({
            compilerOptions: {
              paths: {
                "@/*": ["src/*"],
              },
            },
          }),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false, false, false],
          multiselectResponses: [["check"], [], ["vscode"]],
          selectResponses: ["typescript"],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("oxfmt.config.ts")).toBe(originalOxfmtConfig)
        expect(readJson(files, "tsconfig.json")).toStrictEqual({
          compilerOptions: { paths: { "@/*": ["src/*"] } },
          extends: "adamantite/typescript",
        })
        expect(readJson(files, ".vscode/settings.json")).toMatchObject({
          "editor.defaultFormatter": "oxc.oxc-vscode",
          "editor.tabSize": 4,
        })
        expect(files.exists("oxlint.config.ts")).toBe(true)
      })
    )
  })

  describe("selective setup", () => {
    it.effect("apply only the requested scripts and editor setup", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false, false],
          multiselectResponses: [["check"], [], ["zed"]],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toStrictEqual([
          {
            options: { silent: true, workspace: false },
            packages: [
              "adamantite",
              `oxlint@${oxlint.version}`,
              `tsrs@${tsrs.version}`,
              `oxfmt@${oxfmt.version}`,
            ],
          },
        ])

        expect(readJson(files, "package.json").scripts).toStrictEqual({ check: "adamantite check" })
        expect(files.list()).toStrictEqual([
          ".zed/settings.json",
          "oxfmt.config.ts",
          "oxlint.config.ts",
          "package.json",
        ])
      })
    )
  })

  describe("setup without scripts", () => {
    it.effect("accept no scripts and still ask about the TypeScript preset", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [true, false],
          multiselectResponses: [[], []],
          selectResponses: ["tsconfig"],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect([
          prompter.multiselectCalls[0],
          prompter.confirmCalls[0],
          prompter.selectCalls[0],
        ]).toMatchObject([
          { required: false },
          { message: "Use an Adamantite TypeScript preset?" },
          {
            message: "Which TypeScript preset should Adamantite use?",
            options: [
              {
                hint: "JSON.parse() returns unknown, not any. Avoid in libraries.",
                label: "Strict types",
                value: "typescript",
              },
              {
                hint: "No changes to built-in types. Use for libraries.",
                label: "Strict config",
                value: "tsconfig",
              },
            ],
          },
        ])
        expect(installer.calls).toStrictEqual([
          { options: { silent: true, workspace: false }, packages: ["adamantite"] },
        ])
        expect(files.list()).toStrictEqual(["package.json", "tsconfig.json"])
        expect(readJson(files, "tsconfig.json")).toStrictEqual({ extends: "adamantite/tsconfig" })
      })
    )

    it.effect("change nothing when the user selects no setup", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const originalPackageJson = files.read("package.json")

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false],
          multiselectResponses: [[], []],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toStrictEqual([])
        expect(files.list()).toStrictEqual(["package.json"])
        expect(files.read("package.json")).toBe(originalPackageJson)
        expect(prompter.outros).toStrictEqual([
          "💠 No setup selected, so Adamantite made no changes.",
        ])
      })
    )
  })

  describe("non-interactive setup", () => {
    it.effect.each(["dependencies", "devDependencies"])(
      "keep the adamantite version in $0 and install only the tools",
      (field) =>
        Effect.gen(function* () {
          const files = createInitTestContext({
            "package.json": yield* stringifyJson({
              [field]: { adamantite: "file:../adamantite.tgz" },
              name: "test-project",
              version: "1.0.0",
            }),
          })

          const prompter = createPrompterTestContext()
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "check"], {
            files,
            layers: [prompter.layer, installer.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(installer.calls).toStrictEqual([
            {
              options: { silent: true, workspace: false },
              packages: [
                `oxlint@${oxlint.version}`,
                `tsrs@${tsrs.version}`,
                `oxfmt@${oxfmt.version}`,
              ],
            },
          ])
        })
    )

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
            "analyze",
            "--preset",
            "react",
            "--editor",
            "zed",
            "--typescript",
            "typescript",
            "--install-extensions",
            "--github-actions",
            "--agents",
          ],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter).toMatchObject({ confirmCalls: [], multiselectCalls: [] })
        expect(installer.calls).toStrictEqual([
          {
            options: { silent: true, workspace: false },
            packages: [
              "adamantite",
              `oxlint@${oxlint.version}`,
              `tsrs@${tsrs.version}`,
              `oxfmt@${oxfmt.version}`,
              `knip@${knip.version}`,
            ],
          },
        ])
        expect(readJson(files, "package.json").scripts).toStrictEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
        })
        expect(files.list()).toStrictEqual([
          ...Object.keys(shippedSkill).map((file) => `.agents/skills/adamantite/${file}`),
          ".github/workflows/adamantite.yml",
          ".zed/settings.json",
          "AGENTS.md",
          "knip.config.ts",
          "oxfmt.config.ts",
          "oxlint.config.ts",
          "package.json",
          "tsconfig.json",
        ])
      })
    )

    it.effect.each([
      {
        args: ["--non-interactive", "--typescript", "typescript"],
        name: "no script",
        preset: "typescript",
        scripts: undefined,
      },
      {
        args: ["--non-interactive", "--script", "analyze", "--typescript", "tsconfig"],
        name: "a script without linting",
        preset: "tsconfig",
        scripts: { analyze: "adamantite analyze" },
      },
    ])("set up the $preset preset with $name", ({ args, preset, scripts }) =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, args, {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(readJson(files, "tsconfig.json")).toStrictEqual({ extends: `adamantite/${preset}` })
        expect(readJson(files, "package.json").scripts).toStrictEqual(scripts)
        expect(files.exists("oxlint.config.ts")).toBe(false)
        expect(prompter.spinnerEntries).toContainEqual(
          expect.objectContaining({
            message: `\`tsconfig.json\` created with \`adamantite/${preset}\`.`,
          })
        )
      })
    )

    it.effect("deduplicate a repeated preset", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "react", "--preset", "react"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(getImportedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual(["react"])
      })
    )

    it.effect.each([
      {
        args: ["--non-interactive"],
        name: "neither a script nor TypeScript",
        reason:
          "Select at least one script with `--script <name>`, or a TypeScript preset with `--typescript <preset>`.",
      },
      {
        args: ["--non-interactive", "--script", "analyze", "--preset", "react"],
        name: "a preset without linting",
        reason: "`--preset` requires the `check` or `fix` script.",
      },
      {
        args: ["--non-interactive", "--script", "check", "--preset", "react-strict"],
        name: "react-strict without the react preset",
        reason: "`--preset react-strict` requires `--preset react`.",
      },
      {
        args: ["--non-interactive", "--script", "check", "--preset", "jest", "--preset", "vitest"],
        name: "the jest and vitest presets together",
        reason:
          "`--preset jest` and `--preset vitest` report the same defects. Select one of them.",
      },
      {
        args: ["--non-interactive", "--script", "analyze", "--install-extensions"],
        name: "extension installation without an editor",
        reason: "`--install-extensions` requires at least one `--editor`.",
      },
      {
        args: ["--non-interactive", "--script", "fix", "--github-actions"],
        name: "GitHub Actions without a CI-compatible script",
        reason: "`--github-actions` requires --script check or --script analyze.",
      },
      {
        args: ["--script", "check"],
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
        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toStrictEqual(
          new InvalidInitOptions({ reason })
        )
        expect(installer.calls).toStrictEqual([])
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
          expect(Option.getOrThrow(Exit.findErrorOption(exit))).toStrictEqual(
            new InvalidInitOptions({
              reason:
                "`--github-actions` does not support the detected package manager `aube`. Use bun, deno, npm, pnpm, or yarn.",
            })
          )
          expect(installer.calls).toStrictEqual([])
          expect(files.read("package.json")).toBe(originalPackageJson)
          expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
        })
    )
  })

  describe("existing scripts", () => {
    const conflictingMonorepoPackageJson = JSON.stringify(
      {
        name: "test-project",
        scripts: {
          analyze: "knip --directory packages/app",
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
          ["--non-interactive", "--script", "analyze", "--script", "fix"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls).toStrictEqual([])

        expect(readJson(files, "package.json").scripts).toStrictEqual({
          analyze: "knip --directory packages/app",
          fix: "adamantite fix",
        })

        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Kept existing `analyze` script (`knip --directory packages/app`) instead of `adamantite analyze`. Use `--overwrite-scripts` to replace it.",
        })
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Pass custom tool arguments after `--`, such as `adamantite analyze -- --directory packages/app`.",
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
          ["--non-interactive", "--script", "analyze", "--script", "fix", "--overwrite-scripts"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)

        expect(readJson(files, "package.json").scripts).toStrictEqual({
          analyze: "adamantite analyze",
          fix: "adamantite fix",
        })
        expect(prompter.logs).not.toContainEqual(
          expect.objectContaining({ message: expect.stringContaining("Kept existing") })
        )
      })
    )

    it.effect("replace conflicting scripts when overwriting is confirmed interactively", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* formatJson({
            name: "test-project",
            scripts: { check: "tsc && eslint ." },
            version: "1.0.0",
          }),
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
            "`check` runs `tsc && eslint .`. Adamantite would replace it with `adamantite check`.",
        })
        expect(prompter.confirmCalls[0]).toMatchObject({
          message: "Replace this script with Adamantite's command?",
        })

        expect(readJson(files, "package.json").scripts).toStrictEqual({ check: "adamantite check" })
      })
    )

    it.effect("preserve conflicting scripts when overwriting is declined interactively", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* formatJson({
            name: "test-project",
            scripts: { check: "tsc && eslint ." },
            version: "1.0.0",
          }),
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

        expect(readJson(files, "package.json").scripts).toStrictEqual({ check: "tsc && eslint ." })
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Kept existing `check` script (`tsc && eslint .`) instead of `adamantite check`. Run `adamantite init` again and choose to replace the script.",
        })
      })
    )

    it.effect(
      "do not prompt or warn when existing scripts already match the managed commands",
      () =>
        Effect.gen(function* () {
          const files = createInitTestContext({
            "package.json": yield* formatJson({
              name: "test-project",
              scripts: { check: "adamantite check" },
              version: "1.0.0",
            }),
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

          expect(readJson(files, "package.json").scripts).toStrictEqual({
            check: "adamantite check",
          })
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
          ["--non-interactive", "--script", "analyze", "--script", "check", "--agents"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)

        const agents = files.read("AGENTS.md")
        expect(agents).toContain("bun run check")
        expect(agents).not.toContain("analyze")
      })
    )
  })

  describe("agents guidance", () => {
    it.effect("uses the detected package manager in AGENTS.md guidance", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, true],
          multiselectResponses: [["check"], [], []],
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
        expect(agents).toContain("Run `npm run check` to catch formatting, lint, and type issues")
      })
    )

    it.effect(
      "leaves AGENTS.md unchanged when Adamantite start marker is missing its end marker",
      () =>
        Effect.gen(function* () {
          const existingAgents = `# Existing Instructions\n\n${ADAMANTITE_AGENTS_START_MARKER}\nmanual content\n`

          const files = createInitTestContext({ "AGENTS.md": existingAgents })

          const prompter = createPrompterTestContext({
            confirmResponses: [false, false, true],
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
              "AGENTS.md has an incomplete ADAMANTITE marker. Remove the incomplete marker and run `adamantite init` again.",
          })
          expect(files.read("AGENTS.md")).toBe(existingAgents)
        })
    )

    it.effect("leaves AGENTS.md unchanged when guidance is declined", () =>
      Effect.gen(function* () {
        const existingAgents = "# Existing Instructions\n"
        const files = createInitTestContext({ "AGENTS.md": existingAgents })

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
        expect(files.read("AGENTS.md")).toBe(existingAgents)
      })
    )

    it.effect("continues initialization when AGENTS.md cannot be read", () =>
      Effect.gen(function* () {
        // Seeding a file beneath AGENTS.md turns it into a directory, so reading
        // it fails exactly like the old mkdir-based fixture on the real filesystem.
        const files = createInitTestContext({ "AGENTS.md/placeholder": "" })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, true],
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
          message: expect.stringMatching(
            /Could not update AGENTS\.md\. Could not read `.*\/AGENTS\.md`\. Check that the file exists and is readable, then try again\.( Cause: .*)? Adamantite will continue initialization\./
          ),
        })
        expect(prompter.outros).toStrictEqual(["💠 Setup finished."])
      })
    )
  })

  describe("Adamantite skill", () => {
    it.effect("write the shipped skill to `.agents/skills` and each agent folder that exists", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ ".claude/settings.json": "{}\n" })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "fix", "--agents"],
          { files, layers: [prompter.layer, installer.layer, runner.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([])
        // The project has no `.grok` folder, so `.grok/skills` gets no copy.
        expect(files.list().filter((file) => file.includes("/skills/"))).toStrictEqual(
          [".agents/skills", ".claude/skills"].flatMap((folder) =>
            Object.keys(shippedSkill).map((file) => `${folder}/adamantite/${file}`)
          )
        )

        for (const [file, content] of Object.entries(shippedSkill)) {
          expect(files.read(`.claude/skills/adamantite/${file}`)).toBe(content)
        }

        expect(prompter.spinnerEntries).toContainEqual({
          message: "Adamantite skill added to `.agents/skills` and `.claude/skills`.",
          type: "stop",
        })
      })
    )

    it.effect("ask one question for the AGENTS.md section and the skill", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, true],
          multiselectResponses: [["check"], [], []],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls.at(-1)).toStrictEqual({
          initialValue: true,
          message:
            "Teach coding agents to use Adamantite? This adds an AGENTS.md section and the Adamantite skill.",
        })
        expect(files.read("AGENTS.md")).toContain(ADAMANTITE_AGENTS_START_MARKER)
        expect(files.read(".agents/skills/adamantite/SKILL.md")).toBe(shippedSkill["SKILL.md"])
      })
    )

    it.effect("write no skill when coding agent setup is declined", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ ".claude/settings.json": "{}\n" })

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
        expect(files.list().filter((file) => file.includes("/skills/"))).toStrictEqual([])
      })
    )

    it.effect("leave a skill copy alone when it matches the shipped skill", () =>
      Effect.gen(function* () {
        const copy = Object.fromEntries(
          Object.entries(shippedSkill).map(([file, content]) => [
            `.agents/skills/adamantite/${file}`,
            content,
          ])
        )

        const files = createInitTestContext(copy)
        files.makeReadOnly(".agents/skills/adamantite/SKILL.md")
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "fix", "--agents"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        // A write to the read-only file would fail, so no warning means init wrote nothing.
        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs.filter((log) => log.level === "warning")).toStrictEqual([])
      })
    )

    it.effect("warn and continue when the skill cannot be written", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        files.makeReadOnly(".agents/skills/adamantite/SKILL.md")
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "fix", "--agents"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: expect.stringMatching(
            /^Could not add the Adamantite skill\. Could not write `.*\/\.agents\/skills\/adamantite\/SKILL\.md`\..* Adamantite will continue initialization\.$/
          ),
        })
        expect(prompter.outros).toStrictEqual(["💠 Setup finished."])
      })
    )
  })

  describe("dual-config warnings", () => {
    it.effect("warn when both legacy and modern knip configs exist", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "knip.config.ts":
            'import type { KnipConfig } from "knip"\n\nconst config: KnipConfig = { entry: ["src/index.ts"] }\n\nexport default config\n',
          "knip.json": yield* formatJson({ entry: ["src/main.ts"] }),
        })

        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
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
        expect(error).toBeInstanceOf(NoPackageManager)
      })
    )

    it.effect("create a GitHub Actions workflow for CI-compatible scripts when requested", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [true, true, true, false],
          multiselectResponses: [["check"], ["react"], ["zed"]],
          selectResponses: ["typescript"],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read(".github/workflows/adamantite.yml")).toContain("command: bun run check")
      })
    )

    it.effect("write AGENTS.md and CI for every managed script, not only this run's", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { analyze: "adamantite analyze", check: "adamantite check" },
          }),
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--agents", "--github-actions"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("AGENTS.md")).toContain("bun run analyze")
        expect(files.read(".github/workflows/adamantite.yml")).toContain("command: bun run analyze")
      })
    )

    it.effect("leave out a conflicting script that init kept from AGENTS.md and CI", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { analyze: "adamantite analyze", check: "eslint ." },
          }),
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--agents", "--github-actions"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("AGENTS.md")).not.toContain("bun run check")
        expect(files.read(".github/workflows/adamantite.yml")).not.toContain("bun run check")
      })
    )

    it.effect("write no workflow when init kept every CI script as a conflict", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { check: "eslint ." },
          }),
        })

        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--github-actions"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "No CI script runs an Adamantite command, so `adamantite init` did not set up the GitHub Actions workflow.",
        })
      })
    )

    it.effect("keep a GitHub Actions workflow that the project wrote, and point to doctor", () =>
      Effect.gen(function* () {
        const workflowPath = ".github/workflows/adamantite.yml"
        const workflow = "name: team checks\n"
        const files = createInitTestContext({ [workflowPath]: workflow })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--github-actions"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read(workflowPath)).toBe(workflow)
        expect(prompter.logs).toContainEqual({
          level: "info",
          message: `\`${workflowPath}\` has changes that Adamantite did not make, so \`adamantite init\` kept it. Run \`adamantite doctor\` to see what to update.`,
        })
      })
    )

    it.effect("keep a GitHub Actions workflow whose managed block is malformed", () =>
      Effect.gen(function* () {
        const workflowPath = ".github/workflows/checks.yml"
        const workflow = "jobs:\n  # ADAMANTITE:START\n  verify:\n    runs-on: ubuntu-latest\n"
        const files = createInitTestContext({ [workflowPath]: workflow })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--github-actions"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read(workflowPath)).toBe(workflow)
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message:
            "Adamantite cannot read the managed block in `.github/workflows/checks.yml`, so `adamantite init` kept the workflow. It has `# ADAMANTITE:START` without `# ADAMANTITE:END` after it. Run `adamantite doctor` for the repair.",
        })
      })
    )

    it.effect("not offer GitHub Actions when no selected script runs in CI", () =>
      Effect.gen(function* () {
        // `check` is managed already, but init validates the workflow against the selected scripts.
        const files = createInitTestContext({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { check: "adamantite check" },
          }),
        })

        const prompter = createPrompterTestContext({
          // TypeScript and the AGENTS.md guidance.
          confirmResponses: [false, false],
          multiselectResponses: [["fix"], [], []],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls.map((call) => call.message)).not.toContain(
          "Add a GitHub Actions workflow to run the selected checks?"
        )
      })
    )

    it.effect("not offer GitHub Actions when the user keeps every conflicting CI script", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": yield* stringifyJson({
            name: "test-project",
            scripts: { check: "eslint ." },
          }),
        })

        const prompter = createPrompterTestContext({
          // Keep the conflicting script, then TypeScript and the AGENTS.md guidance.
          confirmResponses: [false, false, false],
          multiselectResponses: [["check"], [], []],
        })

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls.map((call) => call.message)).not.toContain(
          "Add a GitHub Actions workflow to run the selected checks?"
        )
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
      })
    )

    it.effect("not offer GitHub Actions interactively with an unsupported package manager", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          // TypeScript and the AGENTS.md guidance.
          confirmResponses: [false, false],
          multiselectResponses: [["check"], [], []],
        })

        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: { name: "aube" },
        })

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [prompter.layer, installer.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.confirmCalls.map((call) => call.message)).not.toContain(
          "Add a GitHub Actions workflow to run the selected checks?"
        )
        expect(prompter.logs).toContainEqual({
          level: "info",
          message:
            "Adamantite cannot generate a GitHub Actions workflow for `aube`. It supports bun, deno, npm, pnpm, and yarn.",
        })
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
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
        expect(prompter.logs).toStrictEqual(
          expect.arrayContaining([
            {
              level: "warning",
              message: expect.stringMatching(
                /Could not set up the GitHub Actions workflow\. Could not write `.*adamantite\.yml`\. Check the directory permissions and available disk space, then try again\./
              ),
            },
            {
              level: "warning",
              message:
                "Fix the reported problem and run `adamantite init` again, or create the workflow manually.",
            },
          ])
        )
        expect(prompter.outros).toStrictEqual(["💠 Setup finished."])
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
        expect(prompter.cancels).toStrictEqual(["Setup was cancelled."])
        expect(prompter.outros).toStrictEqual([])
        expect(installer.calls).toStrictEqual([])
      })
    )

    it.effect("continue successfully and show the exit code when the extension install fails", () =>
      Effect.gen(function* () {
        const prompter = createPrompterTestContext({
          confirmResponses: [false, true, false, false],
          multiselectResponses: [["check"], [], ["vscode"]],
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
          message: "Install the extension manually after setup finishes.",
        })
      })
    )

    it.effect("continue successfully and show guidance when the VS Code CLI is unavailable", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const prompter = createPrompterTestContext({
          confirmResponses: [false, true, false, false],
          multiselectResponses: [["check"], [], ["vscode"]],
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
        expect(prompter.logs).toStrictEqual(
          expect.arrayContaining([
            { level: "error", message: "VS Code's `code` command was not found on PATH." },
            { level: "info", message: "Add the code command to PATH:" },
          ])
        )
        expect(prompter.outros).toStrictEqual(["💠 Setup finished."])
        expect(files.exists(".vscode/settings.json")).toBe(true)
      })
    )
  })
})

describe("InitOptions", () => {
  it("require an editor for an editor setup", () => {
    // @ts-expect-error - An editor setup names at least one editor.
    const editors: InitOptions["editors"] = Option.some({ installExtensions: true, names: [] })

    expect(Option.isSome(editors)).toBe(true)
  })
})

describe("editor setup", () => {
  it("take only the editors and presets that init knows", () => {
    // A typo or a renamed editor must fail the type check, instead of setting up nothing.
    expectTypeOf(setupEditors).parameter(1).toEqualTypeOf<readonly InitEditor[]>()
    expectTypeOf(installEditorExtensions).parameter(0).toEqualTypeOf<readonly InitEditor[]>()
    expectTypeOf(installEditorExtensions)
      .parameter(2)
      .toEqualTypeOf<readonly LintPreset[] | undefined>()
  })
})
