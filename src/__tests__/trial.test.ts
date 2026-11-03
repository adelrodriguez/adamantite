import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import { getOxlintCommand } from "#lib/execution/oxlint-entry.ts"
import { readOverrides } from "#lib/hardening/overrides.ts"
import { OxlintCommand } from "#lib/hardening/oxlint.ts"
import { type TrialCase, type TrialSetting, tryRule } from "#lib/hardening/trial.ts"

const REPO_ROOT = join(import.meta.dirname, "../..")
const CUSTOM_PRESET = join(REPO_ROOT, "presets/lint/custom.ts")
const RULES_MODULE = join(REPO_ROOT, "presets/rules/index.ts")

// The build writes the toolchain entry beside the CLI, so a run from source starts its source.
const TEST_LAYER = Layer.mergeAll(
  NodeServices.layer,
  Layer.succeed(OxlintCommand)((project) => ({
    ...getOxlintCommand(project),
    args: [join(REPO_ROOT, "src/oxlint.ts")],
  }))
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

const SILENT_RULE = [
  `import { defineRule } from ${JSON.stringify(RULES_MODULE)}`,
  "",
  "export default defineRule({",
  '  meta: { messages: { unexpected: "No console here." }, type: "problem" },',
  "  createOnce() {",
  "    return {}",
  "  },",
  "})",
  "",
].join("\n")

// A workspace package that loads its own rules, and a root config that imports it by name.
const WORKSPACE_FILES = {
  "oxlint.config.ts":
    'import { defineConfig } from "oxlint"\nimport tooling from "tooling"\n\nexport default defineConfig({ extends: [tooling] })\n',
  "package.json": JSON.stringify({ name: "app", type: "module", workspaces: ["packages/*"] }),
  "packages/tooling/.adamantite/rules/no-debugger-here.ts": NO_DEBUGGER_RULE,
  "packages/tooling/index.ts": `import custom from ${JSON.stringify(CUSTOM_PRESET)}\n\nexport default custom()\n`,
  "packages/tooling/package.json": JSON.stringify({
    exports: "./index.ts",
    name: "tooling",
    type: "module",
  }),
}

const EFFECT_CONFIG = [
  'import { defineConfig } from "oxlint"',
  `import effect from ${JSON.stringify(join(REPO_ROOT, "presets/lint/effect.ts"))}`,
  "",
  "export default defineConfig({ extends: [effect] })",
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

function makeCase(filePath: string, expected: TrialCase["expected"], source?: string): TrialCase {
  return { expected, path: filePath, source: Option.fromUndefinedOr(source) }
}

function getReportCounts(results: ReadonlyArray<{ readonly diagnostics: readonly unknown[] }>) {
  return results.map((result) => result.diagnostics.length)
}

describe("rule trials in a real project", () => {
  let project: string
  let cases: string

  function write(file: string, content: string) {
    mkdirSync(dirname(join(project, file)), { recursive: true })
    writeFileSync(join(project, file), content)
  }

  function writeCase(name: string, content: string) {
    writeFileSync(join(cases, name), content)

    return join(cases, name)
  }

  /**
   * Each file and folder of the project, also in `node_modules`, so a test sees every write.
   */
  function listProject() {
    return EffectArray.sort(readdirSync(project, { recursive: true }).map(String), Order.String)
  }

  function runTrial(rule: string, setting: TrialSetting, trialCases: readonly TrialCase[]) {
    return tryRule({ cases: trialCases, cwd: project, rule, setting }).pipe(
      Effect.provide(TEST_LAYER)
    )
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-trial-project-"))
    cases = mkdtempSync(join(tmpdir(), "adamantite-trial-cases-"))
    mkdirSync(join(project, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxlint"), join(project, "node_modules/oxlint"))
    write(".gitignore", "node_modules\n")
    write("package.json", JSON.stringify({ name: "app", type: "module" }))
    write(".adamantite/rules/no-debugger-here.ts", NO_DEBUGGER_RULE)
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
    rmSync(cases, { force: true, recursive: true })
  })

  it.live("report the case with the mistake and accept the correct code at the same path", () =>
    Effect.gen(function* () {
      const before = listProject()
      const results = yield* runTrial(
        "no-restricted-imports",
        { _tag: "Error", options: [{ paths: ["node:fs"] }] },
        [
          makeCase(
            "src/cart.ts",
            "reported",
            writeCase("before.ts", 'import fs from "node:fs"\nexport const cart = fs\n')
          ),
          makeCase("src/cart.ts", "accepted", writeCase("after.ts", "export const cart = 1\n")),
        ]
      )

      expect(results.map((result) => result.diagnostics)).toStrictEqual([
        [{ column: 1, line: 1, message: "'node:fs' import is restricted from being used." }],
        [],
      ])
      expect(results.map((result) => result.config)).toStrictEqual([
        "oxlint.config.ts",
        "oxlint.config.ts",
      ])
      expect(listProject()).toStrictEqual(before)
    })
  )

  it.live("turn on the built-in plugin of a rule that the config does not turn on", () =>
    Effect.gen(function* () {
      const results = yield* runTrial("react/jsx-key", { _tag: "Error", options: [] }, [
        makeCase(
          "src/list.tsx",
          "reported",
          writeCase("list.tsx", "export const list = [1].map((item) => <li>{item}</li>)\n")
        ),
      ])

      expect(getReportCounts(results)).toStrictEqual([1])
    })
  )

  it.live("keep the project setting of a custom rule with --current", () =>
    Effect.gen(function* () {
      const before = listProject()
      const debuggerCase = writeCase("debugger.ts", "export function stop() {\n  debugger\n}\n")
      const results = yield* runTrial("project/no-debugger-here", { _tag: "Current" }, [
        makeCase("src/new.ts", "reported", debuggerCase),
        makeCase("src/legacy.ts", "accepted"),
      ])

      expect(getReportCounts(results)).toStrictEqual([1, 0])
      // `custom()` writes its entry module to the `node_modules` of the copy, not of the project.
      expect(listProject()).toStrictEqual(before)
    })
  )

  it.live("run a rule of the effect preset with the Effect toolchain of the project", () =>
    Effect.gen(function* () {
      // A plain `oxlint` fails to load a config with the `effecttsgo` plugin.
      for (const name of ["@effect", "effect"]) {
        symlinkSync(join(REPO_ROOT, "node_modules", name), join(project, "node_modules", name))
      }

      write("tsconfig.json", '{ "compilerOptions": { "strict": true } }\n')
      write("oxlint.config.ts", EFFECT_CONFIG)

      const results = yield* runTrial("effecttsgo/floating-effect", { _tag: "Current" }, [
        makeCase(
          "src/program.ts",
          "reported",
          writeCase(
            "floating.ts",
            'import * as Effect from "effect/Effect"\n\nEffect.log("lost")\n'
          )
        ),
        makeCase(
          "src/program.ts",
          "accepted",
          writeCase(
            "kept.ts",
            'import * as Effect from "effect/Effect"\n\nexport const program = Effect.log("kept")\n'
          )
        ),
      ])

      expect(getReportCounts(results)).toStrictEqual([1, 0])
    })
  )

  it.live("load a workspace package of the config from the copy", () =>
    Effect.gen(function* () {
      for (const [file, content] of Object.entries(WORKSPACE_FILES)) {
        write(file, content)
      }

      symlinkSync("../packages/tooling", join(project, "node_modules/tooling"))

      const before = listProject()
      const results = yield* runTrial("project/no-debugger-here", { _tag: "Current" }, [
        makeCase("src/legacy.ts", "reported"),
      ])

      expect(getReportCounts(results)).toStrictEqual([1])
      // `custom()` in the package writes its entry module to the copy, not to the project.
      expect(listProject()).toStrictEqual(before)
    })
  )

  it.live("count only the reports of the plugin of the rule", () =>
    Effect.gen(function* () {
      write(".adamantite/rules/no-console.ts", SILENT_RULE)
      write(
        "oxlint.config.ts",
        makeConfig('{ extends: [custom()], rules: { "no-console": "error" } }')
      )

      const results = yield* runTrial("project/no-console", { _tag: "Current" }, [
        makeCase("src/log.ts", "reported", writeCase("log.ts", "console.log(1)\n")),
      ])

      expect(getReportCounts(results)).toStrictEqual([0])
    })
  )

  it.live.each([
    { name: "the project setting", setting: { _tag: "Current" } },
    { name: "a trial setting", setting: { _tag: "Error", options: [] } },
  ] satisfies ReadonlyArray<{ name: string; setting: TrialSetting }>)(
    "keep the root options for a case under a nested config, with $name",
    ({ setting }) =>
      Effect.gen(function* () {
        // Oxlint starts the type-aware backend from `node_modules/.bin`.
        mkdirSync(join(project, "node_modules/.bin"))

        for (const name of ["oxlint-tsgolint", ".bin/tsgolint"]) {
          symlinkSync(join(REPO_ROOT, "node_modules", name), join(project, "node_modules", name))
        }

        write(
          "tsconfig.json",
          '{ "compilerOptions": { "strict": true }, "include": ["**/*.ts"] }\n'
        )
        write("oxlint.config.ts", makeConfig("{ options: { typeAware: true } }"))
        write(
          "packages/web/oxlint.config.ts",
          makeConfig(
            '{ plugins: ["typescript"], rules: { "typescript/no-floating-promises": "error" } }'
          )
        )

        const results = yield* runTrial("typescript/no-floating-promises", setting, [
          makeCase(
            "packages/web/src/a.ts",
            "reported",
            writeCase("floating.ts", "Promise.resolve(1)\nexport {}\n")
          ),
        ])

        expect(getReportCounts(results)).toStrictEqual([1])
      })
  )

  it.live("say that git ignores a project file that the copy does not have", () =>
    Effect.gen(function* () {
      write(".gitignore", "node_modules\nsrc/local.ts\n")
      write("src/local.ts", "console.log(1)\n")

      const failure = yield* runTrial("no-console", { _tag: "Error", options: [] }, [
        makeCase("src/local.ts", "reported"),
      ]).pipe(Effect.flip)

      expect(failure).toMatchObject({
        _tag: "InvalidTrialCase",
        reason: expect.stringContaining("Git ignores this file"),
      })
    })
  )

  it.live.each([
    {
      error: "TrialRuleNotFound",
      name: "fail for a rule that does not exist",
      rule: "no-such-rule",
      source: "export const value = 1\n",
      target: "src/case.ts",
    },
    {
      error: "TrialRuleNotFound",
      name: "fail for a plugin that the config does not load",
      rule: "acme/no-such-rule",
      source: "export const value = 1\n",
      target: "src/case.ts",
    },
    {
      error: "TrialCaseIgnored",
      name: "fail for a case that the config ignores",
      rule: "no-console",
      source: "console.log(1)\n",
      target: "src/generated/case.ts",
    },
    {
      error: "TrialCaseUnparsable",
      name: "fail for a case that does not parse",
      rule: "no-console",
      source: "export const = ;\n",
      target: "src/case.ts",
    },
  ])("$name", ({ error, rule, source, target }) =>
    Effect.gen(function* () {
      const failure = yield* runTrial(rule, { _tag: "Error", options: [] }, [
        makeCase(target, "reported", writeCase("case.ts", source)),
      ]).pipe(Effect.flip)

      expect(failure._tag).toBe(error)
    })
  )

  it.live("mark each file of an override that turns a rule off", () =>
    Effect.gen(function* () {
      const before = listProject()
      const report = yield* readOverrides(project, ["oxlint.config.ts"], null).pipe(
        Effect.provide(TEST_LAYER)
      )

      expect(report).toStrictEqual({
        _tag: "Linted",
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
      expect(listProject()).toStrictEqual(before)
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

      const report = yield* readOverrides(project, ["oxlint.config.ts"], null).pipe(
        Effect.provide(TEST_LAYER)
      )

      expect(report).toStrictEqual({
        _tag: "Linted",
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
    })
  )
})
