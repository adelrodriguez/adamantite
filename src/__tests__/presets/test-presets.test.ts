import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, sep } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import jest from "#presets/lint/jest.ts"
import vitest from "#presets/lint/vitest.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({ code: Schema.optional(Schema.String), filename: Schema.String })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * Lint the files in one real Oxlint run with the config, and return the diagnostic codes of each
 * file, such as `vitest(require-hook)`.
 */
function lint(config: string, files: Record<string, string>) {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-test-presets-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
    writeFileSync(join(tempDir, "oxlint.config.ts"), config)

    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(tempDir, file)), { recursive: true })
      writeFileSync(join(tempDir, file), content)
    }

    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "-f", "json", ...Object.keys(files)],
      { cwd: tempDir, encoding: "utf8" }
    )

    if (result.error) {
      throw result.error
    }

    const codes: Record<string, string[]> = {}

    for (const diagnostic of decodeOxlintJsonOutput(result.stdout).diagnostics) {
      const file = diagnostic.filename.split(sep).join("/")
      codes[file] = [...(codes[file] ?? []), diagnostic.code ?? ""]
    }

    return codes
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

const SCRIPT = "export function run() {\n  return 1\n}\n\nrun()\n"

describe.each([
  {
    moduleMock: ['import { vi } from "vitest"', "", 'vi.mock("./load.ts")', ""],
    name: "vitest",
    preset: vitest,
    testImport: 'import { expect, it } from "vitest"',
  },
  {
    moduleMock: [
      'import { jest } from "@jest/globals"',
      "",
      'jest.mock("./load.ts", () => ({}))',
      "",
    ],
    name: "jest",
    preset: jest,
    testImport: 'import { expect, it } from "@jest/globals"',
  },
])("$name preset", ({ moduleMock, name, preset, testImport }) => {
  const presetPath = JSON.stringify(join(REPO_ROOT, `presets/lint/${name}.ts`))
  const test = `${testImport}\n\nit("adds", () => {\n  expect(1 + 1).toBe(2)\n})\n`

  it("report only test files when a config extends it", () => {
    const codes = lint(
      [`import preset from ${presetPath}`, "", "export default { extends: [preset] }", ""].join(
        "\n"
      ),
      { "src/math.test.ts": test, "src/script.ts": SCRIPT }
    )

    expect(codes["src/math.test.ts"]).toContain(`${name}(require-top-level-describe)`)
    expect(codes["src/script.ts"]).toBeUndefined()
  })

  it("apply its rules to the files and rule changes of a project override", () => {
    const codes = lint(
      [
        `import preset from ${presetPath}`,
        "",
        "export default {",
        "  overrides: [",
        "    {",
        '      files: ["checks/**"],',
        "      plugins: preset.plugins,",
        `      rules: { ...preset.rules, "${name}/require-top-level-describe": "off" },`,
        "    },",
        "  ],",
        "}",
        "",
      ].join("\n"),
      { "checks/math.ts": test, "src/script.ts": SCRIPT }
    )

    expect(codes["checks/math.ts"]).toContain(`${name}(consistent-test-it)`)
    expect(codes["checks/math.ts"]).not.toContain(`${name}(require-top-level-describe)`)
    expect(codes["src/script.ts"]).toBeUndefined()
  })

  // The README tells a project to change a test rule in an override with the preset's plugins,
  // because the preset's override takes priority over top-level rules.
  it.each([
    { change: "the top-level rules", config: "{ extends: [preset], rules }" },
    {
      change: "an override without the preset's plugins",
      config: "{ extends: [preset], overrides: [{ files, rules }] }",
    },
  ])("keep a test rule turned off in $change", ({ config }) => {
    const codes = lint(
      [
        `import preset, { testFiles as files } from ${presetPath}`,
        "",
        `const rules = { "${name}/require-top-level-describe": "off" }`,
        "",
        `export default ${config}`,
        "",
      ].join("\n"),
      { "src/math.test.ts": test }
    )

    expect(codes["src/math.test.ts"]).toContain(`${name}(require-top-level-describe)`)
  })

  it("drop a test rule turned off in an override with the preset's plugins", () => {
    const codes = lint(
      [
        `import preset, { testFiles as files } from ${presetPath}`,
        "",
        `const rules = { "${name}/require-top-level-describe": "off" }`,
        "",
        "export default { extends: [preset], overrides: [{ files, plugins: preset.plugins, rules }] }",
        "",
      ].join("\n"),
      { "src/math.test.ts": test }
    )

    expect(codes["src/math.test.ts"]).not.toContain(`${name}(require-top-level-describe)`)
    expect(codes["src/math.test.ts"]).toContain(`${name}(consistent-test-it)`)
  })

  // A describe title often names the class or function under test, such as `Calculator`.
  it("accept a capital letter at the start of a describe title, and report one in a test title", () => {
    const codes = lint(
      [`import preset from ${presetPath}`, "", "export default { extends: [preset] }", ""].join(
        "\n"
      ),
      {
        "src/math.test.ts": [
          testImport.replace("{ expect, it }", "{ describe, expect, it }"),
          "",
          'describe("Calculator", () => {',
          '  it("Adds", () => {',
          "    expect(1 + 1).toBe(2)",
          "  })",
          "})",
          "",
        ].join("\n"),
      }
    )

    expect(codes["src/math.test.ts"]).toStrictEqual([`${name}(prefer-lowercase-title)`])
  })

  // Strict bans each module mock, so the preset must not tell the author how to write one.
  it("give a module mock only the report of the strict preset", () => {
    const strictPath = JSON.stringify(join(REPO_ROOT, "presets/lint/strict.ts"))

    const codes = lint(
      [
        `import preset from ${presetPath}`,
        `import strict from ${strictPath}`,
        "",
        "export default { extends: [preset, strict] }",
        "",
      ].join("\n"),
      { "src/load.test.ts": moduleMock.join("\n") }
    )

    expect(codes["src/load.test.ts"]).toStrictEqual(["anti-slop(no-module-mocking)"])
  })

  it("expose its plugins and rules only to JavaScript", () => {
    expect(preset.plugins).toStrictEqual([name])
    expect(preset.rules).toHaveProperty(`${name}/require-top-level-describe`)
    expect(Object.keys(preset)).toStrictEqual(["overrides"])
  })
})
