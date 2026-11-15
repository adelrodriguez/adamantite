import type { JsonObject } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import type { InitOptions } from "#commands/init/options.ts"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { managedPlugin } from "#__tests__/managed-plugins.ts"
import { createTerminalTestContext, type TestKey } from "#__tests__/terminal.ts"
import initCommand from "#commands/init/index.ts"
import { getShippedSkillFiles } from "#lib/integrations/agents/skill.macro.ts"
import { toKnipTsConfigContent } from "#lib/integrations/knip/config.ts"
import { PACKAGE as knip } from "#lib/integrations/knip/index.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/oxfmt/config.ts"
import { PACKAGE as oxfmt } from "#lib/integrations/oxfmt/index.ts"
import { getExtendedLintPresets } from "#lib/integrations/oxlint/config.ts"
import { PACKAGE as oxlint } from "#lib/integrations/oxlint/index.ts"
import { lintPresets } from "#lib/integrations/oxlint/presets.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { PACKAGE as sherif } from "#lib/integrations/sherif/index.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { SCRIPT_ORDER } from "#lib/project/package-json.ts"
import { INIT_EDITORS, LINT_PRESETS, TYPESCRIPT_PRESET_NAMES } from "#lib/project/selection.ts"
import { InvalidInitOptions, NoPackageManager } from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import {
  type DependencyInstallerTestContext,
  createDependencyInstallerTestContext,
  createRunnerTestContext,
  hashContent,
  promptingLayer,
  readLockfile,
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

/**
 * The keys that check the given choices of a multiselect and submit it. The prompt lists `Select
 * All` and `Inverse Selection` above its choices, and its cursor starts on `Select All`.
 */
function pickMany<const T>(choices: readonly T[], selected: readonly T[]): TestKey[] {
  const rows = choices.flatMap((choice, index) => (selected.includes(choice) ? [index + 2] : []))

  return [
    ...rows.flatMap((row, index): TestKey[] => [
      ...Array.from({ length: row - (rows[index - 1] ?? 0) }, (): TestKey => "down"),
      "space",
    ]),
    "enter",
  ]
}

/**
 * The keys that submit the given choice of a select, whose cursor starts on the first choice.
 */
function pickOne<const T>(choices: readonly T[], choice: T): TestKey[] {
  return [...Array.from({ length: choices.indexOf(choice) }, (): TestKey => "down"), "enter"]
}

function createInitTestContext(files?: Record<string, string>) {
  return createFileSystemTestContext({
    files: { "package.json": basePackageJson, ...files },
  })
}

function readJson(files: FileSystemTestContext, path: string): JsonObject {
  // SAFETY: every caller asserts the shape of a JSON fixture this test suite wrote itself.
  return JSON.parse(files.read(path)) as JsonObject
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

    const terminal = createTerminalTestContext([
      ...pickMany(SCRIPT_ORDER, ["check", "analyze"]),
      ...pickMany(LINT_PRESETS, ["react"]),
      // Use the TypeScript preset, which the prompt offers by default.
      "enter",
      ...pickOne(TYPESCRIPT_PRESET_NAMES, "typescript"),
      ...pickMany(INIT_EDITORS, ["vscode"]),
      // Decline the GitHub Actions workflow and the agent guidance.
      "n",
      "n",
    ])

    const installer = createDependencyInstallerTestContext()

    const exit = yield* runCommand(initCommand, [], {
      files,
      layers: [installer.layer, promptingLayer],
      terminal,
    })

    return { exit, files, installer, terminal }
  })
}

// Runs init non-interactively with the check script, the effect preset, and TypeScript.
function runEffectSetup() {
  return Effect.gen(function* () {
    const files = createInitTestContext()
    const logLines: unknown[] = []
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
      { files, layers: [installer.layer, runner.layer], logLines }
    )

    return { exit, files, installer, runner }
  })
}

/**
 * The packages that init installed in all its installs, sorted, and the distinct options of the
 * installs. Init installs the tools of the integrations that have not moved to a folder yet, and
 * `Setup.apply` installs the packages of the others.
 */
function sortPackages(packages: readonly string[]) {
  return EffectArray.sort(packages, Order.String)
}

function listInstalls(installer: DependencyInstallerTestContext) {
  return {
    options: EffectArray.dedupeWith(
      installer.calls.map((call) => call.options),
      (first, second) => JSON.stringify(first) === JSON.stringify(second)
    ),
    packages: sortPackages(installer.calls.flatMap((call) => call.packages)),
  }
}

describe("init", () => {
  describe("fresh project setup", () => {
    it.effect("install the managed packages and add the selected scripts", () =>
      Effect.gen(function* () {
        const { exit, files, installer } = yield* runFreshSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(listInstalls(installer)).toStrictEqual({
          options: [{ silent: true, workspace: false }],
          packages: sortPackages([
            `adamantite@${getPackageVersion()}`,
            `oxlint@${oxlint.version}`,
            `tsrs@${tsrs.version}`,
            `oxfmt@${oxfmt.version}`,
            `knip@${knip.version}`,
          ]),
        })
        expect(readJson(files, "package.json").scripts).toStrictEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
        })
      })
    )

    it.effect(
      "record the selection, the version, and the files it wrote whole in the lockfile",
      () =>
        Effect.gen(function* () {
          const { exit, files } = yield* runFreshSetup()

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(readLockfile(files)).toStrictEqual({
            schemaVersion: 1,
            selection: {
              agents: false,
              ci: null,
              editors: ["vscode"],
              presets: ["core", "react"],
              scripts: ["check", "analyze"],
              typescript: "typescript",
            },
            version: getPackageVersion(),
            written: Object.fromEntries(
              [
                "knip.config.ts",
                "oxfmt.config.ts",
                "oxlint.config.ts",
                "tsconfig.json",
                ".vscode/settings.json",
                ".vscode/extensions.json",
              ].map((file) => [file, hashContent(files.read(file))])
            ),
          })
        })
    )

    it.effect("add to the recorded selection when init runs again with other options", () =>
      Effect.gen(function* () {
        const { files, installer } = yield* runFreshSetup()

        // The repair that prepares the VS Code SDK cache runs init with one script and one editor.
        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "fix", "--editor", "zed"],
          { files, layers: [installer.layer] }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(readLockfile(files).selection).toStrictEqual({
          agents: false,
          ci: null,
          editors: ["vscode", "zed"],
          presets: ["core", "react"],
          scripts: ["check", "fix", "analyze"],
          typescript: "typescript",
        })
      })
    )

    it.effect("write the configs for the selected tools, preset, and editor", () =>
      Effect.gen(function* () {
        const { exit, files } = yield* runFreshSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.list()).toStrictEqual([
          ".adamantite/adamantite-lock.json",
          ".vscode/extensions.json",
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
          presets: getExtendedLintPresets(files.read("oxlint.config.ts")),
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
      // The list pages, so the cursor moves to the last preset to show each one.
      const terminal = createTerminalTestContext([
        ...pickMany(SCRIPT_ORDER, ["check"]),
        ...pickMany(LINT_PRESETS, ["tailwind"]),
        "n",
        ...pickMany(INIT_EDITORS, []),
        "n",
        "n",
      ])

      const exit = yield* runCommand(initCommand, [], {
        files: createInitTestContext(),
        layers: [createDependencyInstallerTestContext().layer, promptingLayer],
        terminal,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(
        lintPresets.filter((preset) => !terminal.output().includes(preset.label))
      ).toStrictEqual([])
    })
  )

  it.effect("describe the settings file of each editor choice in interactive init", () =>
    Effect.gen(function* () {
      const files = createInitTestContext()

      // The cursor passes each editor choice, so the prompt shows each description.
      const terminal = createTerminalTestContext([
        ...pickMany(SCRIPT_ORDER, ["check"]),
        ...pickMany(LINT_PRESETS, []),
        "n",
        ...pickMany(INIT_EDITORS, ["vscode", "zed"]),
        "n",
        "n",
      ])

      const exit = yield* runCommand(initCommand, [], {
        files,
        layers: [createDependencyInstallerTestContext().layer, promptingLayer],
        terminal,
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(terminal.output()).toContain(
        "Universal - creates .vscode/settings.json and .vscode/extensions.json for VS Code, Cursor, Windsurf, and more"
      )
      expect(terminal.output()).toContain("Zed - creates .zed/settings.json")
      expect(files.exists(".vscode/settings.json")).toBe(true)
      expect(files.exists(".zed/settings.json")).toBe(true)
    })
  )

  it.effect("configure the first-party plugin presets without extra packages", () =>
    Effect.gen(function* () {
      const files = createInitTestContext({ "package.json": basePackageJson })
      const logLines: unknown[] = []
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
        { files, layers: [installer.layer], logLines }
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(getExtendedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual([
        "tanstack",
        "architecture",
        "strict",
      ])
      expect(listInstalls(installer).packages).toStrictEqual(
        expect.not.arrayContaining([expect.stringMatching(/architecture|strict|tanstack/)])
      )
    })
  )

  describe("managed lint plugins", () => {
    it.effect("install @shadcn/lint when the tailwind preset is selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": basePackageJson })
        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "tailwind"],
          { files, layers: [installer.layer], logLines }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(listInstalls(installer).packages).toContain(`@shadcn/lint@${shadcnLint.version}`)
        expect(files.read("oxlint.config.ts")).toContain(
          'import tailwind from "adamantite/lint/tailwind"'
        )
      })
    )

    it.effect("install oxlint-plugin-react-doctor when the react-strict preset is selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext({ "package.json": basePackageJson })
        const logLines: unknown[] = []
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
          { files, layers: [installer.layer], logLines }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(listInstalls(installer).packages).toContain(
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
        expect(listInstalls(installer).packages).toContain(`@effect/tsgo@${effectTsgo.version}`)
        expect(readJson(files, "package.json")).not.toHaveProperty("scripts.prepare")
        expect(runner.invocations).toStrictEqual([])
      })
    )

    it.effect("configure the effect preset and the language service for effect", () =>
      Effect.gen(function* () {
        const { exit, files } = yield* runEffectSetup()

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(getExtendedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual(["effect"])
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
        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--script", "analyze", "--preset", "effect"],
          { files, layers: [installer.layer, runner.layer], logLines }
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

        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "effect"],
          { files, layers: [installer.layer, runner.layer], logLines }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(readJson(files, "package.json")).toMatchObject({ scripts: { prepare: "husky" } })
      })
    )

    it.effect("keep configs with comments and continue", () =>
      Effect.gen(function* () {
        const tsconfigContent =
          '{\n  // Visit https://aka.ms/tsconfig\n  "compilerOptions": {},\n}\n'

        const vscodeContent = '{\n  // Team setting\n  "editor.tabSize": 4\n}\n'

        const files = createInitTestContext({
          ".vscode/settings.json": vscodeContent,
          "tsconfig.json": tsconfigContent,
        })

        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(
          initCommand,
          [
            "--non-interactive",
            "--script",
            "check",
            "--typescript",
            "typescript",
            "--editor",
            "vscode",
            "--editor",
            "zed",
          ],
          { files, layers: [installer.layer, runner.layer], logLines }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        // Init keeps both files with comments and still creates the Zed settings.
        expect({
          tsconfig: files.read("tsconfig.json"),
          vscode: files.read(".vscode/settings.json"),
          zed: files.exists(".zed/settings.json"),
        }).toStrictEqual({ tsconfig: tsconfigContent, vscode: vscodeContent, zed: true })
        expect(logLines).toContainEqual(
          "● `tsconfig.json` kept, because it has changes that Adamantite did not write. `adamantite doctor` reports a change that breaks the setup."
        )
        expect(logLines).toContainEqual(
          "● `.vscode/settings.json` kept, because it has changes that Adamantite did not write. `adamantite doctor` reports a change that breaks the setup."
        )
        // A kept file is not an updated file, and not a failed step.
        expect(logLines).not.toContainEqual(
          expect.stringMatching(/`(tsconfig\.json|\.vscode\/settings\.json)` updated|Failed/u)
        )
      })
    )

    it.effect("add the react preset when react-strict is selected without it", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const logLines: unknown[] = []

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, ["check"]),
          ...pickMany(LINT_PRESETS, ["react-strict"]),
          "n",
          ...pickMany(INIT_EDITORS, []),
          "n",
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          logLines,
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read("oxlint.config.ts")).toContain(
          'import react from "adamantite/lint/react"'
        )
        expect(logLines).toContainEqual(
          "● Added the `react` preset, which `react-strict` requires."
        )
      })
    )

    it.effect("keep one of the jest and vitest presets when both are selected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, ["check"]),
          ...pickMany(LINT_PRESETS, ["jest", "vitest", "strict"]),
          ...pickOne(["jest", "vitest"], "vitest"),
          "n",
          ...pickMany(INIT_EDITORS, []),
          "n",
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(terminal.output()).toContain(
          "? The jest and vitest presets report the same defects. Which one should Adamantite use? › \n❯ jest \n  vitest "
        )
        expect(terminal.output()).toContain(
          "✔ The jest and vitest presets report the same defects. Which one should Adamantite use? …  vitest"
        )
        expect(getExtendedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual([
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
        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "analyze"], {
          files,
          layers: [installer.layer],
          logLines,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(listInstalls(installer).packages).toStrictEqual(
          sortPackages([
            `adamantite@${getPackageVersion()}`,
            `sherif@${sherif.version}`,
            `knip@${knip.version}`,
          ])
        )
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
          const logLines: unknown[] = []

          const installer = createDependencyInstallerTestContext({
            detectedPackageManager: { name },
          })

          const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "check"], {
            files,
            layers: [installer.layer],
            logLines,
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(listInstalls(installer).options).toStrictEqual([{ silent: true, workspace }])
        })
      )
    }
  })

  describe("selective setup", () => {
    it.effect("apply only the requested scripts and editor setup", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, ["check"]),
          ...pickMany(LINT_PRESETS, []),
          "n",
          ...pickMany(INIT_EDITORS, ["zed"]),
          "n",
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(listInstalls(installer)).toStrictEqual({
          options: [{ silent: true, workspace: false }],
          packages: sortPackages([
            `adamantite@${getPackageVersion()}`,
            `oxlint@${oxlint.version}`,
            `tsrs@${tsrs.version}`,
            `oxfmt@${oxfmt.version}`,
          ]),
        })

        expect(readJson(files, "package.json").scripts).toStrictEqual({ check: "adamantite check" })
        expect(files.list()).toStrictEqual([
          ".adamantite/adamantite-lock.json",
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

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, []),
          "enter",
          ...pickOne(TYPESCRIPT_PRESET_NAMES, "tsconfig"),
          ...pickMany(INIT_EDITORS, []),
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        // The confirm defaults to yes, and the select shows the description of the focused preset.
        expect(terminal.output()).toContain(
          [
            "? Use an Adamantite TypeScript preset? › (Y/n)✔ Use an Adamantite TypeScript preset? … yes",
            "? Which TypeScript preset should Adamantite use? › ",
            "❯ Strict types - JSON.parse() returns unknown, not any. Avoid in libraries.",
            "  Strict config ? Which TypeScript preset should Adamantite use? › ",
            "  Strict types ",
            "❯ Strict config - No changes to built-in types. Use for libraries.✔ Which TypeScript preset should Adamantite use? …  Strict config",
          ].join("\n")
        )
        expect(installer.calls).toStrictEqual([
          {
            options: { silent: true, workspace: false },
            packages: [`adamantite@${getPackageVersion()}`],
          },
        ])
        expect(files.list()).toStrictEqual([
          ".adamantite/adamantite-lock.json",
          "package.json",
          "tsconfig.json",
        ])
        expect(readJson(files, "tsconfig.json")).toStrictEqual({ extends: "adamantite/tsconfig" })
      })
    )

    it.effect("change nothing when the user selects no setup", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const originalPackageJson = files.read("package.json")

        const logLines: unknown[] = []

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, []),
          "n",
          ...pickMany(INIT_EDITORS, []),
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          logLines,
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(installer.calls).toStrictEqual([])
        expect(files.list()).toStrictEqual(["package.json"])
        expect(files.read("package.json")).toBe(originalPackageJson)
        expect(logLines).toStrictEqual([
          "💠 adamantite init",
          "● Detected package manager: bun",
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

          const logLines: unknown[] = []
          const installer = createDependencyInstallerTestContext()

          const exit = yield* runCommand(initCommand, ["--non-interactive", "--script", "check"], {
            files,
            layers: [installer.layer],
            logLines,
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(listInstalls(installer)).toStrictEqual({
            options: [{ silent: true, workspace: false }],
            packages: sortPackages([
              `oxlint@${oxlint.version}`,
              `tsrs@${tsrs.version}`,
              `oxfmt@${oxfmt.version}`,
            ]),
          })
        })
    )

    it.effect("configure the project entirely from flags without showing prompts", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const logLines: unknown[] = []
        const terminal = createTerminalTestContext()
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
            "--github-actions",
            "--agents",
          ],
          { files, layers: [installer.layer], logLines, terminal }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(terminal.output()).toBe("")
        expect(listInstalls(installer)).toStrictEqual({
          options: [{ silent: true, workspace: false }],
          packages: sortPackages([
            `adamantite@${getPackageVersion()}`,
            `oxlint@${oxlint.version}`,
            `tsrs@${tsrs.version}`,
            `oxfmt@${oxfmt.version}`,
            `knip@${knip.version}`,
          ]),
        })
        expect(readJson(files, "package.json").scripts).toStrictEqual({
          analyze: "adamantite analyze",
          check: "adamantite check",
        })
        expect(files.list()).toStrictEqual([
          ".adamantite/adamantite-lock.json",
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
        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, args, {
          files,
          layers: [installer.layer],
          logLines,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(readJson(files, "tsconfig.json")).toStrictEqual({ extends: `adamantite/${preset}` })
        expect(readJson(files, "package.json").scripts).toStrictEqual(scripts)
        expect(files.exists("oxlint.config.ts")).toBe(false)
        expect(logLines).toContainEqual("✔ `tsconfig.json` created.")
      })
    )

    it.effect("deduplicate a repeated preset", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          ["--non-interactive", "--script", "check", "--preset", "react", "--preset", "react"],
          { files, layers: [installer.layer], logLines }
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(getExtendedLintPresets(files.read("oxlint.config.ts"))).toStrictEqual(["react"])
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
        args: ["--non-interactive", "--script", "fix", "--github-actions"],
        name: "GitHub Actions without a CI-compatible script",
        reason: "`--github-actions` requires --script check or --script analyze.",
      },
      {
        args: ["--script", "check"],
        name: "setup flags without non-interactive mode",
        reason: "Setup flags require `--non-interactive`.",
      },
    ])("reject $name before changing the project", ({ args, reason }) =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const originalPackageJson = files.read("package.json")
        const logLines: unknown[] = []
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, args, {
          files,
          layers: [installer.layer],
          logLines,
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
          const logLines: unknown[] = []

          const installer = createDependencyInstallerTestContext({
            detectedPackageManager: { name: "aube" },
          })

          const exit = yield* runCommand(
            initCommand,
            ["--non-interactive", "--script", "check", "--github-actions"],
            { files, layers: [installer.layer], logLines }
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

  describe("edge cases", () => {
    it.effect("fail when no package manager can be detected", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()
        const logLines: unknown[] = []

        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: null,
        })

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer],
          logLines,
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toBeInstanceOf(NoPackageManager)
      })
    )

    it.effect.each([
      { content: "{", error: "InvalidLockfile", name: "does not decode" },
      {
        content: JSON.stringify({ schemaVersion: 2, version: "9.0.0" }),
        error: "UnsupportedLockfile",
        name: "has a newer schema version",
      },
    ])("fail before it changes a file when the lockfile $name", ({ content, error }) =>
      Effect.gen(function* () {
        const files = createInitTestContext({
          [LOCKFILE_PATH]: content,
          "tsconfig.json": EXISTING_MONOREPO_TSCONFIG,
        })

        const listHashes = () =>
          Object.fromEntries(files.list().map((file) => [file, hashContent(files.read(file))]))

        const before = listHashes()
        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(
          initCommand,
          [
            "--non-interactive",
            "--script",
            "check",
            "--typescript",
            "typescript",
            "--editor",
            "vscode",
          ],
          { files, layers: [installer.layer] }
        )

        expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({ _tag: error })
        expect(installer.calls).toStrictEqual([])
        expect(listHashes()).toStrictEqual(before)
      })
    )

    it.effect("create a GitHub Actions workflow for CI-compatible scripts when requested", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const logLines: unknown[] = []

        // Accept the defaults of TypeScript, the extensions, and the workflow, and decline the agent guidance.
        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, ["check"]),
          ...pickMany(LINT_PRESETS, ["react"]),
          "enter",
          ...pickOne(TYPESCRIPT_PRESET_NAMES, "typescript"),
          ...pickMany(INIT_EDITORS, ["zed"]),
          "enter",
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          logLines,
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(files.read(".github/workflows/adamantite.yml")).toContain("command: bun run check")
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

        const logLines: unknown[] = []

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, ["fix"]),
          ...pickMany(LINT_PRESETS, []),
          "n",
          ...pickMany(INIT_EDITORS, []),
          "n",
        ])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          logLines,
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(terminal.output()).not.toContain("Add a GitHub Actions workflow")
      })
    )

    it.effect("not offer GitHub Actions interactively with an unsupported package manager", () =>
      Effect.gen(function* () {
        const files = createInitTestContext()

        const logLines: unknown[] = []

        const terminal = createTerminalTestContext([
          ...pickMany(SCRIPT_ORDER, ["check"]),
          ...pickMany(LINT_PRESETS, []),
          "n",
          ...pickMany(INIT_EDITORS, []),
          "n",
        ])

        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: { name: "aube" },
        })

        const exit = yield* runCommand(initCommand, [], {
          files,
          layers: [installer.layer, promptingLayer],
          logLines,
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(terminal.output()).not.toContain("Add a GitHub Actions workflow")
        expect(logLines).toContainEqual(
          "● Adamantite cannot generate a GitHub Actions workflow for `aube`. It supports bun, deno, npm, pnpm, and yarn."
        )
        expect(files.exists(".github/workflows/adamantite.yml")).toBe(false)
      })
    )

    it.effect("gracefully handle prompt cancellation", () =>
      Effect.gen(function* () {
        const logLines: unknown[] = []

        const terminal = createTerminalTestContext(["ctrl+c"])

        const installer = createDependencyInstallerTestContext()

        const exit = yield* runCommand(initCommand, [], {
          files: createInitTestContext(),
          layers: [installer.layer, promptingLayer],
          logLines,
          terminal,
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(logLines).toStrictEqual([
          "💠 adamantite init",
          "● Detected package manager: bun",
          "\n■ Setup was cancelled.",
        ])
        expect(installer.calls).toStrictEqual([])
      })
    )
  })
})

describe("InitOptions", () => {
  it("require an editor for an editor setup", () => {
    // @ts-expect-error - An editor setup names at least one editor.
    const editors: InitOptions["editors"] = Option.some([])

    expect(Option.isSome(editors)).toBe(true)
  })
})
