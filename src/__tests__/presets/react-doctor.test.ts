import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { beforeAll, describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import reactStrict from "#presets/lint/react-strict.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/react-doctor")
const NAMESPACE = "react-doctor"
const CLEAN_FIXTURE = "clean.tsx"

const presetRules = Object.keys(reactStrict.rules ?? {})
  .filter((name) => name.startsWith(`${NAMESPACE}/`))
  .map((name) => name.slice(NAMESPACE.length + 1))

const fixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.name !== CLEAN_FIXTURE)
  .flatMap((entry) =>
    entry.isFile()
      ? [{ file: entry.name, kind: "invalid", rule: basename(entry.name, ".tsx") }]
      : ["invalid", "valid"].flatMap((kind) =>
          readdirSync(join(FIXTURES_DIR, entry.name, kind)).map((file) => ({
            file: `${entry.name}/${kind}/${file}`,
            kind,
            rule: entry.name,
          }))
        )
  )

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
 * Lint the React Doctor fixtures with react and react-strict in one real Oxlint run. The plugin
 * resolves from the repository's `node_modules`, as it does from a target project's. The fixtures
 * are copied to `src/hooks/` because some React Doctor rules skip fixture paths. Hook modules also
 * exercise the rules where react-strict permits state and effect hooks.
 */
function lintFixtures() {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-react-doctor-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
    cpSync(FIXTURES_DIR, join(tempDir, "src/hooks"), { recursive: true })
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { react: "19.2.0" }, name: "fixture", type: "module" })
    )
    writeFileSync(
      join(tempDir, "oxlint.config.ts"),
      [
        'import { defineConfig } from "oxlint"',
        `import react from ${JSON.stringify(join(REPO_ROOT, "presets/lint/react.ts"))}`,
        `import reactStrict from ${JSON.stringify(join(REPO_ROOT, "presets/lint/react-strict.ts"))}`,
        "",
        "export default defineConfig({ extends: [react, reactStrict] })",
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

    if (result.signal !== null || ![0, 1].includes(result.status ?? -1)) {
      throw new Error(`Oxlint did not finish the fixture run.\n${result.stdout}${result.stderr}`)
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

describe("React Doctor rules in react-strict", () => {
  it("have fixtures for exactly the enabled rules", () => {
    expect(new Set(fixtures.map((fixture) => fixture.rule))).toStrictEqual(new Set(presetRules))
  })
})

describe("React Doctor and native React rule overlap", () => {
  let diagnostics: (typeof OxlintJsonOutput.Type)["diagnostics"]

  function getFixtureCodes(fixture: string) {
    return diagnostics
      .filter((diagnostic) => diagnostic.filename === `src/hooks/${fixture}`)
      .map((diagnostic) => diagnostic.code)
  }

  beforeAll(() => {
    diagnostics = lintFixtures()
  })

  it.each(fixtures.filter((fixture) => fixture.kind === "invalid"))(
    "report $file through its rule",
    ({ file, rule }) => {
      expect(
        getFixtureCodes(file).filter((code) => code?.startsWith(`${NAMESPACE}(`))
      ).toStrictEqual([`${NAMESPACE}(${rule})`])
    }
  )

  it.each(fixtures.filter((fixture) => fixture.kind === "invalid"))(
    "leave $file to the react-doctor rules",
    ({ file }) => {
      const nativeCodes = getFixtureCodes(file).filter((code) => !code?.startsWith(`${NAMESPACE}(`))

      expect(nativeCodes).toStrictEqual([])
    }
  )

  it.each(fixtures.filter((fixture) => fixture.kind === "valid"))("accept $file", ({ file }) => {
    expect(getFixtureCodes(file)).toStrictEqual([])
  })

  it("report nothing for a plain component", () => {
    expect(getFixtureCodes(CLEAN_FIXTURE)).toStrictEqual([])
  })
})
