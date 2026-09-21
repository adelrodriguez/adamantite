import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeAll, describe, expect, test } from "@effect/vitest"
import { plugin as shadcnPlugin } from "@shadcn/lint"
import * as Schema from "effect/Schema"
import shadcn from "#presets/lint/shadcn.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/shadcn-overlap")
const NAMESPACE = "shadcn"

const presetRules = Object.keys(shadcn.rules ?? {})
  .filter((name) => name.startsWith(`${NAMESPACE}/`))
  .map((name) => name.slice(NAMESPACE.length + 1))

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Number }) })),
    })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * Lint the overlap fixtures with the react and shadcn presets in one real Oxlint run. The plugin
 * resolves from the repository's `node_modules`, as it does from a target project's.
 */
function lintOverlapFixtures() {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-shadcn-overlap-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
    cpSync(FIXTURES_DIR, join(tempDir, "fixtures"), { recursive: true })
    writeFileSync(
      join(tempDir, "oxlint.config.ts"),
      [
        'import { defineConfig } from "oxlint"',
        `import react from ${JSON.stringify(join(REPO_ROOT, "presets/lint/react.ts"))}`,
        `import shadcn from ${JSON.stringify(join(REPO_ROOT, "presets/lint/shadcn.ts"))}`,
        "",
        "export default defineConfig({ extends: [react, shadcn] })",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "-f", "json", "fixtures"],
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

describe("shadcn preset", () => {
  test("enable exactly the rules the managed plugin defines", () => {
    expect(new Set(presetRules)).toEqual(new Set(Object.keys(shadcnPlugin.rules)))
  })

  test("load the plugin by its package name", () => {
    expect(shadcn.jsPlugins).toEqual(["@shadcn/lint"])
  })
})

describe("shadcn and react preset overlap", () => {
  let diagnostics: (typeof OxlintJsonOutput.Type)["diagnostics"] = []

  beforeAll(() => {
    diagnostics = lintOverlapFixtures()
  })

  test("report the fixtures through the plugin", () => {
    const codes = new Set(diagnostics.map((diagnostic) => diagnostic.code))

    expect(codes).toContain("shadcn(no-inline-styles)")
    expect(codes).toContain("shadcn(no-raw-colors)")
  })

  test("leave shadcn findings to the shadcn rules", () => {
    const overlapping = diagnostics
      .map((diagnostic) => diagnostic.code)
      .filter(
        (code) => code === "react(no-unknown-property)" || code === "react(style-prop-object)"
      )

    // A string `style` prop is the one known overlap: react/style-prop-object reports the type
    // of the value, and shadcn/no-inline-styles reports the inline style itself.
    expect(overlapping).toEqual(["react(style-prop-object)"])
  })
})
