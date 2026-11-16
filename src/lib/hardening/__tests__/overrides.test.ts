import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import type { readSuppressions } from "#lib/hardening/suppressions.ts"
import type * as Project from "#lib/project/index.ts"
import { LintedOverrides, readOverrides } from "#lib/hardening/overrides.ts"
import { OxlintCommand } from "#lib/hardening/oxlint.ts"
import { toProjectPath } from "#lib/hardening/project-files.ts"
import { getOxlintCommand } from "#lib/integrations/oxlint/entry.ts"
import { ConfigLoader } from "#lib/project/config-loader.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../..")
const CUSTOM_PRESET = join(REPO_ROOT, "presets/rules/index.ts")
const RULES_MODULE = join(REPO_ROOT, "presets/rules/plugin.ts")

// Oxlint uses the backend in `OXLINT_TSGOLINT_PATH` before it looks in `node_modules/.bin` or on
// `PATH`, and `pnpm test` puts the repository's launcher on `PATH`. Each lint run gets a path that
// does not exist, so only a launcher that the test project installs can start the backend. The
// entry removes the variable when it finds that launcher.
const MISSING_BACKEND = join(REPO_ROOT, "missing-tsrs-lint")

// The build writes the Oxlint entry beside the CLI, so a run from source starts its source.
const TEST_LAYER = Layer.mergeAll(
  NodeServices.layer,
  ConfigLoader.layer.pipe(Layer.provide(NodeServices.layer)),
  Layer.succeed(OxlintCommand)((project) => {
    const command = getOxlintCommand(project)

    return {
      ...command,
      args: [join(REPO_ROOT, "src/oxlint/index.ts")],
      env: { ...command.env, OXLINT_TSGOLINT_PATH: MISSING_BACKEND },
    }
  })
)

const NO_DEBUGGER_RULE = [
  `import { defineRule } from ${JSON.stringify(RULES_MODULE)}`,
  "",
  "export default defineRule({",
  '  meta: { messages: { unexpected: "No debugger here." }, type: "problem" },',
  "  createOnce(context) {",
  "    return {",
  "      DebuggerStatement(node) {",
  '        context.report({ messageId: "unexpected", node })',
  "      },",
  "    }",
  "  },",
  "})",
  "",
].join("\n")

function makeConfig(body: string) {
  return [
    'import { defineConfig } from "oxlint"',
    `import custom from ${JSON.stringify(CUSTOM_PRESET)}`,
    "",
    `export default defineConfig(${body})`,
    "",
  ].join("\n")
}

// An override that spreads the rules of the vitest preset and turns a project rule off.
const VITEST_RULES_CONFIG = [
  `import vitest from ${JSON.stringify(join(REPO_ROOT, "presets/lint/vitest.ts"))}`,
  makeConfig(
    '{ extends: [custom()], overrides: [{ files: ["src/legacy.ts"], plugins: vitest.plugins, rules: { ...vitest.rules, "project/no-debugger-here": "off" } }] }'
  ),
].join("\n")

// The fixtures without a workspace package declare no workspace.
const NO_WORKSPACE: Project.Workspace = { catalogs: {}, isMonorepo: false, packageDirectories: [] }

describe("hardening paths", () => {
  it("take project paths, not absolute paths, for configs and the scope", () => {
    // Discovery gives absolute config paths, and `path.join(cwd, config)` of one names a file that
    // does not exist, so only a project path type-checks.
    expectTypeOf<readonly string[]>().not.toExtend<Parameters<typeof readOverrides>[2]>()
    expectTypeOf<string>().not.toExtend<Parameters<typeof readOverrides>[3]>()
    expectTypeOf<string>().not.toExtend<Parameters<typeof readSuppressions>[1]>()
  })
})

describe("readOverrides", () => {
  let project: string

  function write(file: string, content: string) {
    mkdirSync(dirname(join(project, file)), { recursive: true })
    writeFileSync(join(project, file), content)
  }

  /**
   * Each file and folder of the project, also in `node_modules`, so a test sees every write.
   */
  function listProject() {
    return EffectArray.sort(readdirSync(project, { recursive: true }).map(String), Order.String)
  }

  function readRootOverrides() {
    return Path.Path.pipe(
      Effect.flatMap((path) =>
        readOverrides(
          project,
          NO_WORKSPACE,
          [toProjectPath(path, project, join(project, "oxlint.config.ts"))],
          null
        )
      ),
      Effect.provide(TEST_LAYER)
    )
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-overrides-project-"))
    mkdirSync(join(project, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxlint"), join(project, "node_modules/oxlint"))
    write(".gitignore", "node_modules\n")
    write("package.json", JSON.stringify({ name: "app", type: "module" }))
    write(".adamantite/lint/no-debugger-here.ts", NO_DEBUGGER_RULE)
    write(
      "oxlint.config.ts",
      makeConfig(
        '{ extends: [custom()], ignorePatterns: ["src/generated/**"], rules: { "no-debugger": "off" }, overrides: [{ files: ["src/legacy.ts", "src/fixed.ts", "src/gone.ts", "**/*.test.ts"], rules: { "project/no-debugger-here": "off" } }] }'
      )
    )
    write("src/index.ts", "export const value = 1\n")
    write("src/legacy.ts", "export function stop() {\n  debugger\n}\n")
    write("src/fixed.ts", "export const fixed = 1\n")
    spawnSync("git", ["init", "-q"], { cwd: project })
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it.live("mark each file of an override that turns a rule off", () =>
    Effect.gen(function* () {
      const before = listProject()

      const report = yield* readRootOverrides()

      expect(report).toStrictEqual(
        new LintedOverrides({
          rules: [
            {
              config: "oxlint.config.ts",
              files: [
                { file: "src/legacy.ts", mark: "breaks" },
                { file: "src/fixed.ts", mark: "clean" },
                { file: "src/gone.ts", mark: "missing" },
              ],
              globs: ["**/*.test.ts"],
              rule: "project/no-debugger-here",
            },
          ],
        })
      )
      expect(listProject()).toStrictEqual(before)
    })
  )

  // The rules of the vitest preset name the preset under the identity key, which is not a rule.
  it.live("read an override that spreads the rules of a preset", () =>
    Effect.gen(function* () {
      write("oxlint.config.ts", VITEST_RULES_CONFIG)

      const report = yield* readRootOverrides()

      expect(report).toBeInstanceOf(LintedOverrides)
      expect(report).toHaveProperty(
        "rules",
        expect.arrayContaining([
          expect.objectContaining({
            files: [{ file: "src/legacy.ts", mark: "breaks" }],
            rule: "project/no-debugger-here",
          }),
        ])
      )
    })
  )

  it.live("mark the files of an override that the config ignores or that do not parse", () =>
    Effect.gen(function* () {
      write(
        "oxlint.config.ts",
        makeConfig(
          '{ extends: [custom()], ignorePatterns: ["src/generated/**"], overrides: [{ files: ["src/generated/old.ts", "src/broken.ts"], rules: { "project/no-debugger-here": "off" } }] }'
        )
      )
      write("src/generated/old.ts", "export function stop() {\n  debugger\n}\n")
      write("src/broken.ts", "export const = ;\n")

      const report = yield* readRootOverrides()

      expect(report).toStrictEqual(
        new LintedOverrides({
          rules: [
            {
              config: "oxlint.config.ts",
              files: [
                { file: "src/generated/old.ts", mark: "ignored" },
                { file: "src/broken.ts", mark: "unparsable" },
              ],
              globs: [],
              rule: "project/no-debugger-here",
            },
          ],
        })
      )
    })
  )
})
