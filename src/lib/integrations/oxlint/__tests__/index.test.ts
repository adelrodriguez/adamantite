import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { findingsLeft, getFailure, makeLockfileFile } from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection, runLifecycle } from "#__tests__/lifecycle.ts"
import oxlint, { PACKAGE } from "#lib/integrations/oxlint/index.ts"
import { ConfigLoader } from "#lib/project/config-loader.ts"
import * as Project from "#lib/project/index.ts"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { LINT_PRESETS } from "#lib/project/selection.ts"

const REPO = join(import.meta.dirname, "../../../../..")

const CONFIG = "oxlint.config.ts"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check", "--preset", "vitest"]

const OPTIONS = [
  "  ignorePatterns: core.ignorePatterns,",
  "  options: {",
  "    respectEslintDisableDirectives: true,",
  "    typeAware: true,",
  "    typeCheck: true,",
  "  },",
  "})",
  "",
]

const RENDERED = [
  'import core from "adamantite/lint"',
  'import vitest from "adamantite/lint/vitest"',
  'import custom from "adamantite/rules"',
  'import { defineConfig } from "oxlint"',
  "",
  "export default defineConfig({",
  "  extends: [core, vitest, custom()],",
  ...OPTIONS,
].join("\n")

const WITHOUT_VITEST = RENDERED.replace(
  'import vitest from "adamantite/lint/vitest"\n',
  ""
).replace("[core, vitest, custom()]", "[core, custom()]")

const MISSING_PRESET = "The config does not apply a selected lint preset"

const EXCLUDED_PRESETS = "The config extends two presets that report the same defects"

function assess(root: string) {
  return Effect.runPromise(
    Project.read().pipe(
      Effect.flatMap((project) =>
        oxlint.assess(project, {
          agents: false,
          ci: null,
          editors: [],
          presets: ["core"],
          scripts: ["check"],
          typescript: null,
        })
      ),
      Effect.provideService(Project.Directory, root),
      Effect.provide([
        NodeServices.layer,
        ModuleResolver.layer,
        ConfigLoader.layer.pipe(Layer.provide(NodeServices.layer)),
      ])
    )
  )
}

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

describe("Oxlint setup", () => {
  it.effect("create the config of the selected presets", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect({
        config: files.read(CONFIG),
        failure: getFailure(exit),
      }).toStrictEqual({
        config: RENDERED,
        failure: findingsLeft("init"),
      })
      expect(output).toContain(`✔ \`${CONFIG}\` created.`)
    })
  )

  it.effect.each([
    {
      change: "a preset before core",
      config: RENDERED.replace("[core, vitest, custom()]", "[vitest, core, custom()]"),
      finding:
        "`oxlint.config.ts` applies `adamantite/lint/vitest` before the core preset `adamantite/lint` in `extends`.",
    },
    {
      change: "two presets that report the same defects",
      config: RENDERED.replace(
        'import vitest from "adamantite/lint/vitest"',
        'import jest from "adamantite/lint/jest"\nimport vitest from "adamantite/lint/vitest"'
      ).replace("[core, vitest, custom()]", "[core, jest, vitest, custom()]"),
      finding: "`oxlint.config.ts` extends the `jest` and `vitest` presets",
    },
    {
      change: "a selected preset removed",
      config: WITHOUT_VITEST,
      finding:
        "The lockfile selects the `vitest` preset, and no Oxlint config of the project applies `adamantite/lint/vitest`.",
    },
    {
      change: "a required option turned off",
      config: RENDERED.replace("typeCheck: true", "typeCheck: false"),
      finding: "The required Oxlint options are missing or are not set to true.",
    },
  ])("keep a config with $change, and report it in doctor", ({ config, finding }) =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(CONFIG, config)

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(CONFIG)).toBe(config)
      expect(init.output).toContain(`● \`${CONFIG}\` kept, because it has changes`)
      expect(doctor.output).toContain(finding)
    })
  )

  // Oxlint loads the config of each workspace package.
  it.effect("report no missing preset that a workspace package config applies", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(CONFIG, WITHOUT_VITEST)
      files.write("pnpm-workspace.yaml", "packages:\n  - packages/*\n")
      files.write("packages/web/package.json", '{ "name": "web" }\n')
      files.write(
        `packages/web/${CONFIG}`,
        [
          'import vitest from "adamantite/lint/vitest"',
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({ extends: [vitest] })",
          "",
        ].join("\n")
      )

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).not.toContain(MISSING_PRESET)
    })
  )

  it.effect("report neither a missing nor an excluded preset in disjoint overrides", () =>
    Effect.gen(function* () {
      const files = makeProject({
        ...makeLockfileFile(
          makeSelection({ presets: ["core", "jest", "vitest"], scripts: ["check"] })
        ),
        [CONFIG]: [
          'import core from "adamantite/lint"',
          'import jest from "adamantite/lint/jest"',
          'import vitest from "adamantite/lint/vitest"',
          'import custom from "adamantite/rules"',
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  extends: [core, custom()],",
          "  overrides: [",
          '    { files: ["legacy/**/*.test.ts"], plugins: jest.plugins, rules: { ...jest.rules } },',
          '    { files: ["src/**/*.test.ts"], plugins: vitest.plugins, rules: { ...vitest.rules } },',
          "  ],",
          ...OPTIONS,
        ].join("\n"),
      })

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).not.toContain(MISSING_PRESET)
      expect(output).not.toContain(EXCLUDED_PRESETS)
    })
  )

  // Oxlint fails when it finds both in one folder.
  it.effect.each([".oxlintrc.json", ".oxlintrc.jsonc"])(
    "write no config beside a conflicting %s, and report it",
    (file) =>
      Effect.gen(function* () {
        const conflicting = '{ "rules": { "semi": "error" } }\n'
        const files = makeProject({ [file]: conflicting })

        yield* runLifecycle("init", files, INIT_ARGS)
        const doctor = yield* runLifecycle("doctor", files)

        expect({
          config: files.exists(CONFIG),
          conflicting: files.read(file),
        }).toStrictEqual({
          config: false,
          conflicting,
        })
        expect(doctor.output).toContain(
          `The project configures oxlint in \`${file}\`, so Adamantite does not write \`oxlint.config.ts\`.`
        )
      })
  )
})

const PATTERNS = '["error", { patterns: ["**/commands/**"] }]'

function restrict(folder: string, rule: string) {
  return `    { files: ["src/${folder}/**"], rules: { "no-restricted-imports": ${rule} } },`
}

function withOverrides(config: string, overrides: readonly string[]) {
  return config.replace(
    "  ignorePatterns:",
    ["  overrides: [", ...overrides, "  ],", "  ignorePatterns:"].join("\n")
  )
}

const MAPPED = RENDERED.replace(
  "  ignorePatterns:",
  [
    '  overrides: ["shared", "services", "terminal"].map((folder) => ({',
    '    files: ["src/" + folder + "/**"],',
    `    rules: { "no-restricted-imports": ${PATTERNS} },`,
    "  })),",
    "  ignorePatterns:",
  ].join("\n")
)

const EXTENDED = RENDERED.replace(
  "export default defineConfig({",
  [
    "const layers = {",
    "  overrides: [",
    restrict("shared", PATTERNS),
    restrict("services", PATTERNS),
    "  ],",
    "}",
    "",
    "export default defineConfig({",
  ].join("\n")
).replace("[core, vitest, custom()]", "[core, vitest, layers, custom()]")

const decodeReport = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      findings: Schema.Array(Schema.Struct({ id: Schema.String })),
      warnings: Schema.Array(Schema.String),
    })
  )
)

function readReport(files: ReturnType<typeof makeProject>) {
  return runLifecycle("doctor", files, ["--json"]).pipe(
    Effect.flatMap(({ output }) => decodeReport(output)),
    Effect.map(({ findings, warnings }) => ({ findings: findings.map(({ id }) => id), warnings }))
  )
}

const PLUGIN_STEP =
  "Import `adamantite/lint/architecture` in `oxlint.config.ts`, and add it to `extends` after the core preset. It loads the `adamantite` plugin."

function describeLayerMapWarning(file: string, count: number) {
  return `- \`${file}\` states import layers by hand in ${count} \`no-restricted-imports\` overrides with \`patterns\`.`
}

describe("hand-written layer maps", () => {
  it.effect.each([
    {
      config: withOverrides(RENDERED, [
        restrict("shared", PATTERNS),
        restrict("services", PATTERNS),
      ]),
      count: 2,
      overrides: "two overrides with patterns",
    },
    { config: MAPPED, count: 3, overrides: "overrides from a .map() callback" },
    { config: EXTENDED, count: 2, overrides: "overrides in an extends entry" },
  ])("warn about $overrides", ({ config, count }) =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const before = yield* readReport(files)
      files.write(CONFIG, config)

      const doctor = yield* runLifecycle("doctor", files)
      const after = yield* readReport(files)

      expect(doctor.output).toContain(describeLayerMapWarning(CONFIG, count))
      expect(doctor.output).toContain(`\n  1. ${PLUGIN_STEP}`)
      expect(after).toStrictEqual({
        findings: before.findings,
        warnings: [...before.warnings, expect.stringContaining("states import layers by hand")],
      })
    })
  )

  it.effect.each([
    { config: withOverrides(RENDERED, [restrict("shared", PATTERNS)]), overrides: "one override" },
    {
      config: withOverrides(RENDERED, [
        restrict("shared", '["error", { paths: ["node:fs"] }]'),
        restrict("services", '["error", { paths: ["node:child_process"] }]'),
      ]),
      overrides: "overrides with only paths",
    },
    {
      config: withOverrides(RENDERED, [
        restrict("shared", PATTERNS),
        restrict("__tests__", '"off"'),
      ]),
      overrides: "an override that turns the rule off",
    },
    {
      config: withOverrides(RENDERED, [
        restrict("shared", PATTERNS.replace('"error"', '"off"')),
        restrict("services", PATTERNS.replace('"error"', '"off"')),
      ]),
      overrides: "overrides that turn the rule off with patterns",
    },
  ])("do not warn about $overrides", ({ config }) =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(CONFIG, config)

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).not.toContain("states import layers by hand")
    })
  )

  it.effect("leave out the plugin step when the config loads the plugin", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(
        CONFIG,
        withOverrides(
          RENDERED.replace(
            'import core from "adamantite/lint"',
            'import core from "adamantite/lint"\nimport architecture from "adamantite/lint/architecture"'
          ).replace("[core, vitest, custom()]", "[core, architecture, vitest, custom()]"),
          [restrict("shared", PATTERNS), restrict("services", PATTERNS)]
        )
      )

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).toContain(describeLayerMapWarning(CONFIG, 2))
      expect(output).not.toContain("It loads the `adamantite` plugin.")
      expect(output).toContain("\n  2. Use `ignore`")
    })
  )

  it.effect("warn about the overrides of a config that spreads a preset", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(
        CONFIG,
        withOverrides(
          RENDERED.replace(
            "export default defineConfig({",
            "export default defineConfig({\n  ...core,"
          ).replace("[core, vitest, custom()]", "[vitest, custom()]"),
          [restrict("shared", PATTERNS), restrict("services", PATTERNS)]
        )
      )

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).toContain(describeLayerMapWarning(CONFIG, 2))
    })
  )

  it.effect("do not warn about a config that extends every preset", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(
        CONFIG,
        [
          'import core from "adamantite/lint"',
          ...LINT_PRESETS.map(
            (preset, index) => `import preset${index} from "adamantite/lint/${preset}"`
          ),
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          `  extends: [core, ${LINT_PRESETS.map((_preset, index) => `preset${index}`).join(", ")}],`,
          ...OPTIONS,
        ].join("\n")
      )

      const report = yield* readReport(files)

      expect(report.findings).toContain("excluded-presets")
      expect(report.warnings).toStrictEqual([])
    })
  )

  // Oxlint loads the config of each workspace package, and replaces override options per config.
  it.effect("warn about the overrides of a workspace package config", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write("pnpm-workspace.yaml", "packages:\n  - packages/*\n")
      files.write("packages/web/package.json", '{ "name": "web" }\n')
      files.write(
        `packages/web/${CONFIG}`,
        [
          'import { defineConfig } from "oxlint"',
          "",
          "export default defineConfig({",
          "  overrides: [",
          restrict("shared", PATTERNS),
          restrict("services", PATTERNS),
          "  ],",
          "})",
          "",
        ].join("\n")
      )

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).toContain(describeLayerMapWarning(`packages/web/${CONFIG}`, 2))
    })
  )
})

describe("oxlint config load", () => {
  it("report the error of a workspace config that imports a preset the package does not export", async () => {
    expect.hasAssertions()
    const root = mkdtempSync(join(tmpdir(), "adamantite-config-load-"))

    try {
      mkdirSync(join(root, "node_modules"))
      symlinkSync(join(REPO, "node_modules/oxlint"), join(root, "node_modules/oxlint"), "dir")
      symlinkSync(REPO, join(root, "node_modules/adamantite"), "dir")
      mkdirSync(join(root, "packages/app"), { recursive: true })
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          devDependencies: { oxlint: PACKAGE.version },
          name: "probe",
          scripts: { check: "adamantite check" },
          type: "module",
        })
      )
      writeFileSync(join(root, "oxlint.config.ts"), "export default {}\n")
      // A lint run loads the config of each folder, so a package config fails the whole run.
      writeFileSync(
        join(root, "packages/app/oxlint.config.ts"),
        'import shadcn from "adamantite/lint/shadcn"\nexport default { extends: [shadcn] }\n'
      )
      writeFileSync(join(root, "packages/app/index.ts"), "export const value = 1\n")

      const assessment = await assess(root)

      expect(assessment.findings).toContainEqual(
        expect.objectContaining({
          currentState: expect.stringContaining(
            "Package subpath './lint/shadcn' is not defined by \"exports\""
          ),
          id: "oxlint-config-load-failure",
        })
      )
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
