import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, sep } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "@effect/vitest"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const RESTRICTED_IMPORT_CODE = "eslint(no-restricted-imports)"

interface LayerImportCase {
  /**
   * Importing file, relative to the temporary project root.
   */
  readonly file: string
  readonly reported: boolean
  readonly specifier: string
}

const CASES: readonly LayerImportCase[] = [
  { file: "src/lib/shared/alias.ts", reported: true, specifier: "#lib/integrations/base.ts" },
  { file: "src/lib/shared/relative.ts", reported: true, specifier: "../integrations/base.ts" },
  {
    file: "src/lib/shared/package-json.ts",
    reported: false,
    specifier: "../../../package.json",
  },
  { file: "src/lib/workspace/alias.ts", reported: true, specifier: "#lib/integrations/base.ts" },
  {
    file: "src/lib/workspace/nested/relative.ts",
    reported: true,
    specifier: "../../integrations/base.ts",
  },
  { file: "src/lib/workspace/lower.ts", reported: false, specifier: "#lib/shared/errors.ts" },
  {
    file: "src/lib/execution/sibling.ts",
    reported: true,
    specifier: "#lib/workspace/package-json.ts",
  },
  {
    file: "src/lib/integrations/lower.ts",
    reported: false,
    specifier: "#lib/workspace/package-json.ts",
  },
  {
    file: "src/lib/integrations/tooling/knip/same-folder.ts",
    reported: false,
    specifier: "./config.ts",
  },
  {
    file: "src/lib/integrations/higher.ts",
    reported: true,
    specifier: "#lib/assessment/index.ts",
  },
  {
    file: "src/lib/integrations/tooling/relative.ts",
    reported: true,
    specifier: "../../assessment/index.ts",
  },
  {
    file: "src/lib/assessment/lower.ts",
    reported: false,
    specifier: "#lib/integrations/base.ts",
  },
  { file: "src/lib/assessment/terminal.ts", reported: true, specifier: "#terminal/title.ts" },
]

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({ code: Schema.optional(Schema.String), filename: Schema.String })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * Lint every case in one real Oxlint run with only the repository's overrides, and return the files
 * that `no-restricted-imports` reported.
 */
function lintLayerImports(tempDir: string): Set<string> {
  symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
  writeFileSync(
    join(tempDir, "oxlint.config.ts"),
    [
      'import { defineConfig } from "oxlint"',
      `import repository from ${JSON.stringify(join(REPO_ROOT, "oxlint.config.ts"))}`,
      "",
      "export default defineConfig({ overrides: repository.overrides })",
      "",
    ].join("\n")
  )

  for (const { file, specifier } of CASES) {
    mkdirSync(join(tempDir, dirname(file)), { recursive: true })
    writeFileSync(join(tempDir, file), `import ${JSON.stringify(specifier)}\n`)
  }

  const result = spawnSync(
    join(REPO_ROOT, "node_modules/.bin/oxlint"),
    ["-c", "oxlint.config.ts", "-f", "json", "src"],
    { cwd: tempDir, encoding: "utf8" }
  )

  if (result.error) {
    throw result.error
  }

  const output = decodeOxlintJsonOutput(result.stdout)

  return new Set(
    output.diagnostics
      .filter((diagnostic) => diagnostic.code === RESTRICTED_IMPORT_CODE)
      .map((diagnostic) => diagnostic.filename.split(sep).join("/"))
  )
}

describe("lib layer imports", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-lib-layers-"))
  let reported = new Set<string>()

  beforeAll(() => {
    reported = lintLayerImports(tempDir)
  })

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  test.each(CASES)("$file importing $specifier", ({ file, reported: expected }) => {
    expect(reported.has(file)).toBe(expected)
  })
})
