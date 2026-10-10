import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import effect from "#presets/lint/effect.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const NAMESPACE = "effecttsgo"
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
  "global-random",
  "global-timers",
  "new-promise",
  "node-builtin-import",
  "prefer-schema-over-json",
  "process-env",
  "schema-sync",
  // A rule that Adamantite enables reports the same defect, or core or strict decides it.
  "strict-boolean-expressions",
  "unnecessary-arrow-block",
  // They depend on the project layout or on library-authoring choices.
  "deterministic-keys",
  "missing-pipeable-signature",
  // They are a style preference and report no defect.
  "missed-pipeable-opportunity",
  "new-schema-class",
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

const presetRules = Object.keys(effect.rules ?? {}).map((name) => name.slice(NAMESPACE.length + 1))

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({ code: Schema.optional(Schema.String), filename: Schema.String })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * Lint the files with the effect preset in one real Oxlint run. Oxlint, oxlint-tsgolint, and
 * `effect` resolve from the repository's `node_modules`, which the `prepare` script patched.
 */
function lint(files: Record<string, string>) {
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
        `import effect from ${JSON.stringify(join(REPO_ROOT, "presets/lint/effect.ts"))}`,
        "",
        "export default defineConfig({ extends: [effect] })",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "-f", "json", ...Object.keys(files)],
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

  it("ship patched binaries for the pinned Oxlint, oxlint-tsgolint, and TypeScript", () => {
    const { devDependencies } = decodeRootPackageJson(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8")
    )
    const platformPackageJson = createRequire(tsgoPackageJson).resolve(
      `@effect/tsgo-${process.platform}-${process.arch}/package.json`
    )
    const missing = ["oxlint", "oxlint-tsgolint", "typescript"]
      .map((tool) => `${tool}/${devDependencies[tool]}`)
      .filter((artifact) => !existsSync(join(dirname(platformPackageJson), "artifacts", artifact)))

    expect(missing).toStrictEqual([])
  })

  it("report Effect misuse through the patched Oxlint", () => {
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
})
