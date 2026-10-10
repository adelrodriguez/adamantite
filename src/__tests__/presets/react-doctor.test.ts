import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import reactDoctorPlugin from "oxlint-plugin-react-doctor"
import reactDoctor from "#presets/lint/react-doctor.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/react-doctor")
const NAMESPACE = "react-doctor"
const CLEAN_FIXTURE = "clean.tsx"

const presetRules = Object.keys(reactDoctor.rules ?? {})
  .filter((name) => name.startsWith(`${NAMESPACE}/`))
  .map((name) => name.slice(NAMESPACE.length + 1))

const ruleFixtures = readdirSync(FIXTURES_DIR).filter((file) => file !== CLEAN_FIXTURE)

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Finite }) })),
    })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * Lint the fixtures with the react and react-doctor presets in one real Oxlint run. The plugin
 * resolves from the repository's `node_modules`, as it does from a target project's. The fixtures
 * are copied to `src/` because some React Doctor rules skip files under a `fixtures/` path.
 */
function lintFixtures() {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-react-doctor-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
    cpSync(FIXTURES_DIR, join(tempDir, "src"), { recursive: true })
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { react: "19.2.0" }, name: "fixture", type: "module" })
    )
    writeFileSync(
      join(tempDir, "oxlint.config.ts"),
      [
        'import { defineConfig } from "oxlint"',
        `import react from ${JSON.stringify(join(REPO_ROOT, "presets/lint/react.ts"))}`,
        `import reactDoctor from ${JSON.stringify(join(REPO_ROOT, "presets/lint/react-doctor.ts"))}`,
        "",
        "export default defineConfig({ extends: [react, reactDoctor] })",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "-f", "json", "src"],
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

describe("react-doctor preset", () => {
  it("enable only rules the managed plugin defines", () => {
    const pluginRules = new Set(Object.keys(reactDoctorPlugin.rules))

    expect(presetRules.filter((rule) => !pluginRules.has(rule))).toStrictEqual([])
  })

  it("load the plugin by its package name", () => {
    expect(reactDoctor.jsPlugins).toStrictEqual(["oxlint-plugin-react-doctor"])
  })

  it("have one fixture for each enabled rule", () => {
    expect(new Set(ruleFixtures.map((file) => basename(file, ".tsx")))).toStrictEqual(
      new Set(presetRules)
    )
  })
})

describe("react-doctor and react preset overlap", () => {
  let diagnostics: (typeof OxlintJsonOutput.Type)["diagnostics"]

  function getFixtureCodes(fixture: string) {
    return diagnostics
      .filter((diagnostic) => basename(diagnostic.filename) === fixture)
      .map((diagnostic) => diagnostic.code)
  }

  beforeAll(() => {
    diagnostics = lintFixtures()
  })

  it.each(ruleFixtures)("report %s through the plugin", (fixture) => {
    expect(getFixtureCodes(fixture)).toContain(`${NAMESPACE}(${basename(fixture, ".tsx")})`)
  })

  it.each(ruleFixtures)("leave %s to the react-doctor rules", (fixture) => {
    const nativeCodes = getFixtureCodes(fixture).filter(
      (code) => !code?.startsWith(`${NAMESPACE}(`)
    )

    expect(nativeCodes).toStrictEqual([])
  })

  it("report nothing for a plain component", () => {
    expect(getFixtureCodes(CLEAN_FIXTURE)).toStrictEqual([])
  })
})
