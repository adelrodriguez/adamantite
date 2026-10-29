import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, sep } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"
import { toCustomRuleTestStub } from "#lib/workspace/custom-rules/index.ts"
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
  { name: "vitest", preset: vitest, testImport: 'import { expect, it } from "vitest"' },
  { name: "jest", preset: jest, testImport: 'import { expect, it } from "@jest/globals"' },
])("$name preset", ({ name, preset, testImport }) => {
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

  it("skip the rule test that rule add writes", () => {
    // `adamantite rule test` runs `tests/<name>.ts` with `node --test`. It is not a test of the
    // project's runner, so the test rules, such as `require-hook`, do not apply to it.
    const codes = lint(
      [`import preset from ${presetPath}`, "", "export default { extends: [preset] }", ""].join(
        "\n"
      ),
      { ".adamantite/rules/tests/no-foo.ts": toCustomRuleTestStub("no-foo") }
    )

    expect(codes).toStrictEqual({})
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

  it("expose its plugins and rules only to JavaScript", () => {
    expect(preset.plugins).toStrictEqual([name])
    expect(preset.rules).toHaveProperty(`${name}/require-top-level-describe`)
    expect(Object.keys(preset)).toStrictEqual(["overrides"])
  })
})
