import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import effect from "#presets/lint/effect.ts"
import antislopEffectPlugin from "#presets/lint/plugin/anti-slop-effect/index.ts"
import {
  lintRuleFixtures,
  listFixtureRules,
  type RuleFixtureCase,
  selectRuleFixtures,
} from "./rule-fixtures.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const NAMESPACE = "effecttsgo"
const ANTISLOP_NAMESPACE = "anti-slop-effect"
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/effect")
const CATEGORY_PRESETS = ["correctness", "antipattern", "effect-native", "style"] as const

// Every upstream rule that the preset does not enable. ADR 0007 gives the criteria.
const EXCLUDED_RULES = new Set([
  // It depends on the entry points of the project.
  "strict-effect-provide",
  // They ban platform APIs in code that is not Effect code.
  "async-function",
  "crypto-random-uuid",
  "extends-native-error",
  "global-console",
  "global-date",
  "global-fetch",
  "global-json",
  "global-random",
  "global-timers",
  "new-promise",
  "node-builtin-import",
  "prefer-effect-array",
  "prefer-effect-record",
  "prefer-effect-string",
  "process-env",
  "schema-sync",
  // A rule that Adamantite enables reports the same defect, or core or strict decides it.
  "strict-boolean-expressions",
  "unnecessary-arrow-block",
  // They depend on the project layout or on library-authoring choices.
  "deterministic-keys",
  "missing-pipeable-signature",
  "prefer-barrel-import",
  "prefer-namespace-import",
  // They are a style preference and report no defect.
  "missed-pipeable-opportunity",
  "new-schema-class",
  "prefer-schema-tagged-error",
  "type-union-to-schema-union",
  "yield-in-call-argument",
  // `Effect.Service` exists only in Effect v3.
  "missing-effect-service-dependency",
])

const require = createRequire(import.meta.url)
const tsgoPackageJson = require.resolve("@effect/tsgo/package.json")

const CategoryPreset = Schema.Struct({ rules: Schema.Record(Schema.String, Schema.String) })
const decodeCategoryPreset = Schema.decodeUnknownSync(Schema.fromJsonString(CategoryPreset))

const RootPackageJson = Schema.Struct({
  devDependencies: Schema.Record(Schema.String, Schema.String),
})

const decodeRootPackageJson = Schema.decodeUnknownSync(Schema.fromJsonString(RootPackageJson))

const upstreamRules = CATEGORY_PRESETS.flatMap((category) =>
  Object.keys(
    decodeCategoryPreset(
      readFileSync(join(dirname(tsgoPackageJson), "oxlint-presets", `${category}.json`), "utf8")
    ).rules
  )
).map((name) => name.slice(NAMESPACE.length + 1))

function listPresetRules(namespace: string) {
  return Object.keys(effect.rules ?? {})
    .filter((name) => name.startsWith(`${namespace}/`))
    .map((name) => name.slice(namespace.length + 1))
}

const presetRules = listPresetRules(NAMESPACE)
const antislopPresetRules = listPresetRules(ANTISLOP_NAMESPACE)

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({ code: Schema.optional(Schema.String), filename: Schema.String })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * Lint the files with the presets in one real Oxlint run, through the Oxlint entry. Oxlint,
 * `@effect/tsgo`, and `effect` resolve from the repository's `node_modules`, which nothing patches.
 * The presets extend in order, as in the config that init writes. `jsPlugins` adds plugins next to
 * the presets.
 */
function lint(
  files: Record<string, string>,
  {
    jsPlugins = [],
    presets = ["effect"],
  }: { jsPlugins?: readonly string[]; presets?: readonly string[] } = {}
) {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-effect-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))

    for (const [file, content] of Object.entries(files)) {
      writeFileSync(join(tempDir, file), content)
    }

    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "fixture", type: "module" })
    )
    writeFileSync(
      join(tempDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "esnext", moduleResolution: "bundler", strict: true },
      })
    )
    writeFileSync(
      join(tempDir, "oxlint.config.ts"),
      [
        'import { defineConfig } from "oxlint"',
        ...presets.map(
          (preset) =>
            `import ${preset} from ${JSON.stringify(join(REPO_ROOT, `presets/lint/${preset}.ts`))}`
        ),
        "",
        `export default defineConfig({ extends: [${presets.join(", ")}], jsPlugins: ${JSON.stringify(jsPlugins)} })`,
        "",
      ].join("\n")
    )

    const result = spawnSync(
      process.execPath,
      [
        join(REPO_ROOT, "src/oxlint.ts"),
        "-c",
        "oxlint.config.ts",
        "-f",
        "json",
        ...Object.keys(files).filter((file) => file.endsWith(".ts")),
      ],
      { cwd: tempDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )

    if (result.error) {
      throw result.error
    }

    try {
      return decodeOxlintJsonOutput(result.stdout).diagnostics
    } catch (error) {
      throw new Error(`Oxlint did not print JSON diagnostics.\n${result.stdout}${result.stderr}`, {
        cause: error,
      })
    }
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

describe("effect preset", () => {
  it("enable only rules that @effect/tsgo defines", () => {
    expect(presetRules.filter((rule) => !upstreamRules.includes(rule))).toStrictEqual([])
  })

  it("decide on every @effect/tsgo rule", () => {
    const decided = new Set([...presetRules, ...EXCLUDED_RULES])
    const undecided = upstreamRules.filter((rule) => !decided.has(rule))

    expect(undecided).toStrictEqual([])
    expect(presetRules.filter((rule) => EXCLUDED_RULES.has(rule))).toStrictEqual([])
  })

  // The runtime loads the Effect builds from `artifacts/<tool>/<version>` of the platform package.
  it("ship Effect builds for the pinned Oxlint and tsrs", () => {
    const { devDependencies } = decodeRootPackageJson(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8")
    )

    const platformDirectory = dirname(
      createRequire(tsgoPackageJson).resolve(
        `@effect/tsgo-${process.platform}-${process.arch}/package.json`
      )
    )

    const artifacts = ["oxlint", "tsrs"].map((tool) => `${tool}/${devDependencies[tool]}`)

    const missing = artifacts.filter(
      (artifact) => !existsSync(join(platformDirectory, "artifacts", artifact))
    )

    expect(missing).toStrictEqual([])
  })

  it("report Effect misuse through the Oxlint entry", () => {
    const diagnostics = lint({
      "bad.ts": [
        'import * as Effect from "effect/Effect"',
        "",
        "export function run() {",
        '  Effect.log("lost")',
        "}",
        "",
      ].join("\n"),
      "good.ts": [
        'import * as Effect from "effect/Effect"',
        "",
        'export const program = Effect.log("kept")',
        "",
      ].join("\n"),
    })

    expect(diagnostics.map(({ code, filename }) => ({ code, filename }))).toStrictEqual([
      { code: `${NAMESPACE}(floating-effect)`, filename: "bad.ts" },
    ])
  })

  // Core's unicorn array rules match a method by its name only. They read `Option.some(value)` as
  // `Array.prototype.some` with a callback, and a data-first `Array` function as an array method
  // with a `thisArg`.
  it("accept Effect module functions that share a name with array methods", () => {
    const diagnostics = lint(
      {
        "good.ts": [
          'import * as Array from "effect/Array"',
          'import * as Option from "effect/Option"',
          "",
          "export function first(values: readonly string[], fallback: string) {",
          "  const found = Array.findLast(values, (value) => value.length > 0)",
          "",
          "  return Option.isSome(found) ? found : Option.some(fallback)",
          "}",
          "",
        ].join("\n"),
      },
      { presets: ["core", "effect"] }
    )

    expect(diagnostics.map(({ code }) => code)).toStrictEqual([])
  })

  // The Effect binding loads through `NAPI_RS_NATIVE_LIBRARY_PATH`, which every napi-rs package
  // reads. The plugin loads `oxc-parser`, which the entry does not load itself, so the plugin fails
  // to load when the variable outlives the Oxlint binding.
  it("load a JS plugin that loads a napi-rs package next to the Effect binding", () => {
    const diagnostics = lint(
      {
        "bad.ts": [
          'import * as Effect from "effect/Effect"',
          "",
          "export function run() {",
          '  Effect.log("lost")',
          "}",
          "",
        ].join("\n"),
        "napi-plugin.mjs": [
          'import { parseSync } from "oxc-parser"',
          "",
          'parseSync("probe.js", "1")',
          "",
          'export default { meta: { name: "napi" }, rules: {} }',
          "",
        ].join("\n"),
      },
      { jsPlugins: ["./napi-plugin.mjs"] }
    )

    expect(diagnostics.map(({ code }) => code)).toStrictEqual([`${NAMESPACE}(floating-effect)`])
  })
})

describe("effect preset anti-slop rules", () => {
  it("enable exactly the rules the anti-slop-effect plugin defines", () => {
    expect(new Set(antislopPresetRules)).toStrictEqual(
      new Set(Object.keys(antislopEffectPlugin.rules))
    )
  })

  it("have fixtures for exactly the rules the preset enables", () => {
    expect(listFixtureRules(FIXTURES_DIR)).toStrictEqual(
      EffectArray.sort(
        antislopPresetRules.map((rule) => `${ANTISLOP_NAMESPACE}/${rule}`),
        Order.String
      )
    )
  })
})

describe("effect preset anti-slop rule fixtures", () => {
  let cases: RuleFixtureCase[]

  beforeAll(() => {
    cases = lintRuleFixtures({
      fixturesDir: FIXTURES_DIR,
      presetPath: join(REPO_ROOT, "presets/lint/effect.ts"),
    })
  })

  describe.each(listFixtureRules(FIXTURES_DIR))("%s", (rule) => {
    it("report every invalid fixture", () => {
      const invalid = selectRuleFixtures(cases, rule, "invalid")
      const missed = invalid.filter((entry) => entry.reportedLines.length === 0)

      expect(invalid).not.toStrictEqual([])
      expect(missed.map((entry) => entry.file)).toStrictEqual([])
    })

    it("report no valid fixture", () => {
      const valid = selectRuleFixtures(cases, rule, "valid")
      const reported = valid.filter((entry) => entry.reportedLines.length > 0)

      expect(valid).not.toStrictEqual([])
      expect(
        reported.map((entry) => `${entry.file}:${entry.reportedLines.join(",")}`)
      ).toStrictEqual([])
    })
  })
})
