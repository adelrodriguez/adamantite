import type { JsonObject } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import initCommand from "#commands/init/index.ts"
import { toKnipTsConfigContent } from "#lib/integrations/tooling/knip/config.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import {
  getImportedLintPresets,
  toOxlintTsConfigContent,
} from "#lib/integrations/tooling/oxlint/config.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
import reactDoctor from "#lib/integrations/tooling/oxlint/plugins/react-doctor.ts"
import shadcnLint from "#lib/integrations/tooling/oxlint/plugins/shadcn.ts"
import tsgolint from "#lib/integrations/tooling/oxlint/tsgolint.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { CliNotFound } from "#lib/shared/errors.ts"
import { ADAMANTITE_AGENTS_START_MARKER } from "#lib/workspace/agents.ts"
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

// Runs init interactively with the check and analyze scripts, the react preset, and VS Code.
function runFreshSetup() {
  return Effect.gen(function* () {
    const files = createInitTestContext()
    const prompter = createPrompterTestContext({
      confirmResponses: [true, false, false, false],
      multiselectResponses: [["check", "analyze"], ["react"], ["vscode"]],
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
      ["--non-interactive", "--script", "check", "--preset", "effect", "--typescript"],
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
              `oxlint-tsgolint@${tsgolint.version}`,
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
            message: `Legacy \`${legacyConfig}\` was preserved during \`adamantite init\`. Run \`adamantite doctor\` and follow its findings to migrate it to the latest ${tool} config.`,
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
          "react",
          "--preset",
          "react-strict",
          "--preset",
          "strict",
          "--preset",
          "tanstack",
        ],
        { files, layers: [prompter.layer, installer.layer] }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(getImportedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual([
        "react",
        "react-strict",
        "strict",
        "tanstack",
      ])
      expect(installer.calls[0]?.packages).toStrictEqual(
        expect.not.arrayContaining([expect.stringMatching(/strict|tanstack/)])
      )
    })
  )

  describe("managed lint plugins", () => {
    it.effect("install @shadcn/lint when the shadcn preset is selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": basePackageJson })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "shadcn"],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toContain(`@shadcn/lint@${shadcnLint.version}`)
        expect(files.read("oxlint.config.ts")).toContain(
          'import shadcn from "adamantite/lint/shadcn"'
        )
      })
    )

    it.effect("install oxlint-plugin-react-doctor when the react-doctor preset is selected", () =>
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
            "react-doctor",
          ],
          { files, layers: [prompter.layer, installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toContain(
          `oxlint-plugin-react-doctor@${reactDoctor.version}`
        )
        expect(files.read("oxlint.config.ts")).toContain(
          'import reactDoctor from "adamantite/lint/react-doctor"'
        )
      })
    )

    it.effect("install @effect/tsgo and patch Oxlint for effect", () =>
      Effect.gen(function* () {
        const { exit, files, installer, runner } = yield* runEffectSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls[0]?.packages).toContain(`@effect/tsgo@${effectTsgo.version}`)
        expect(readJson(files, "package.json")).toMatchObject({
          scripts: { prepare: "adamantite prepare" },
        })
        expect(runner.invocations).toStrictEqual([
          expect.objectContaining({
            args: ["patch", "--oxlint", "--typescript"],
            command: "effect-tsgo",
            stderr: "ignore",
            stdout: "ignore",
          }),
        ])
      })
    )

    it.effect("configure the effect preset and the language service for effect", () =>
      Effect.gen(function* () {
        const { exit, files } = yield* runEffectSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(getImportedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual(["effect"])
        expect(readJson(files, "tsconfig.json")).toStrictEqual({
          compilerOptions: {
            plugins: [{ diagnostics: false, name: "@effect/language-service" }],
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

    it.effect("add adamantite prepare to the start of an existing prepare script", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "package.json": JSON.stringify({ name: "test-project", scripts: { prepare: "husky" } }),
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
        expect(readJson(files, "package.json")).toMatchObject({
          scripts: { prepare: "adamantite prepare && (husky)" },
        })
        expect(runner.invocations).toHaveLength(1)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: expect.stringContaining("No `tsconfig.json` found"),
        })
      })
    )

    it.effect("patch a project that already uses the effect preset without selecting it", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          "oxlint.config.ts": toOxlintTsConfigContent(["effect"]),
        })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "check"], {
          files,
          layers: [prompter.layer, installer.layer, runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toStrictEqual([
          expect.objectContaining({ args: ["patch", "--oxlint", "--typescript"] }),
        ])
      })
    )

    it.effect("warn and continue when the patch fails", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "tsconfig.json": "{}" })
        const prompter = createPrompterTestContext()
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "effect"],
          { files, layers: [prompter.layer, installer.layer, runner.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(prompter.logs).toContainEqual({
          level: "warning",
          message: expect.stringContaining("Run `adamantite prepare` to see why the patch failed."),
        })
        expect(readJson(files, "tsconfig.json")).toStrictEqual({
          compilerOptions: {
            plugins: [{ diagnostics: false, name: "@effect/language-service" }],
          },
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

    it.effect("add the react preset when react-doctor is selected without it", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const prompter = createPrompterTestContext({
          confirmResponses: [false, false, false],
          multiselectResponses: [["check"], ["react-doctor"], []],
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
          message: "Added the `react` preset, which `react-doctor` requires.",
        })
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
    it.effect("leave the root tsconfig unchanged and print guidance in a monorepo", () =>
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
        expect(prompter.logs).toStrictEqual(
          expect.arrayContaining([
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
          multiselectResponses: [["check"], [], ["vscode"]],
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
              `oxlint-tsgolint@${tsgolint.version}`,
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

  describe("non-interactive setup", () => {
    it.effect.each(["dependencies", "devDependencies"])(
      "keep the adamantite version in $0 and install only the tools",
      (field) =>
        Effect.gen(function* () {
          const files = createInitTestContext({
            "package.json": JSON.stringify({
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
                `oxlint-tsgolint@${tsgolint.version}`,
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
              `oxlint-tsgolint@${tsgolint.version}`,
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
        name: "a missing script",
        reason: "Select at least one script with `--script <name>`.",
      },
      {
        args: ["--non-interactive", "--script", "analyze", "--preset", "react"],
        name: "a preset without linting",
        reason: "`--preset` requires the `check` or `fix` script.",
      },
      {
        args: ["--non-interactive", "--script", "check", "--preset", "react-doctor"],
        name: "react-doctor without the react preset",
        reason: "`--preset react-doctor` requires `--preset react`.",
      },
      {
        args: ["--non-interactive", "--script", "analyze", "--typescript"],
        name: "TypeScript without linting",
        reason: "`--typescript` requires the `check` or `fix` script.",
      },
      {
        args: ["--non-interactive", "--script", "analyze", "--install-extensions"],
        name: "extension installation without an editor",
        reason: "`--install-extensions` requires at least one `--editor`.",
      },
      {
        args: ["--non-interactive", "--script", "fix", "--github-actions"],
        name: "GitHub Actions without a CI-compatible script",
        reason: "`--github-actions` requires a CI-compatible script.",
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
        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
          _tag: "InvalidInitOptions",
          reason,
        })
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
          expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({
            _tag: "InvalidInitOptions",
            reason:
              "`--github-actions` does not support the detected package manager `aube`. Use bun, deno, npm, pnpm, or yarn.",
          })
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
            "Adamantite commands forward extra arguments after `--`, so custom flags can be kept, e.g. `adamantite analyze -- --directory packages/app`.",
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

        expect(readJson(files, "package.json").scripts).toStrictEqual({ check: "adamantite check" })
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

        expect(readJson(files, "package.json").scripts).toStrictEqual({ check: "tsc && eslint ." })
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
        expect(agents).toContain("adamantite check")
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
            /Could not update AGENTS\.md\. Failed to read `.*\/AGENTS\.md`\.( Cause: .*)? Adamantite will continue initialization\./
          ),
        })
        expect(prompter.logs).toContainEqual({
          level: "success",
          message: "Your project is now configured",
        })
        expect(prompter.outros).toStrictEqual(["💠 Adamantite initialized successfully!"])
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
          multiselectResponses: [["check"], ["react"], ["zed"]],
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
                /Could not set up the GitHub Actions workflow\. Failed to write `.*adamantite\.yml`\./
              ),
            },
            {
              level: "warning",
              message:
                "Fix the reported problem and run `adamantite init` again, or create the workflow manually.",
            },
            { level: "success", message: "Your project is now configured" },
          ])
        )
        expect(prompter.outros).toStrictEqual(["💠 Adamantite initialized successfully!"])
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
        expect(prompter.cancels).toStrictEqual(["You've cancelled the initialization process."])
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
            { level: "error", message: "VSCode CLI ('code' command) not found." },
            { level: "info", message: "To install it:" },
            { level: "success", message: "Your project is now configured" },
          ])
        )
        expect(prompter.outros).toStrictEqual(["💠 Adamantite initialized successfully!"])
        expect(files.exists(".vscode/settings.json")).toBe(true)
      })
    )
  })
})
