import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import process from "node:process"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { addCustomRuleTest, toCustomRuleStub } from "#lib/workspace/custom-rules/index.ts"

const REPO_ROOT = join(import.meta.dirname, "../../../../..")
const CUSTOM_PRESET = join(REPO_ROOT, "presets/rules/index.ts")
const RULES_MODULE = join(REPO_ROOT, "presets/rules/plugin.ts")
const TESTING_MODULE = join(REPO_ROOT, "presets/rules/testing.ts")

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      severity: Schema.String,
    })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * The stub that rule add writes, with its import pointed at this checkout.
 */
function makeStub() {
  return toCustomRuleStub("no-debugger-here").replace(
    '"adamantite/rules/plugin"',
    JSON.stringify(RULES_MODULE)
  )
}

/**
 * A config that loads the rules folder with custom(), and turns off the core rule that reports the
 * same `debugger` statement.
 */
const CUSTOM_CONFIG = [
  'import { defineConfig } from "oxlint"',
  `import custom from ${JSON.stringify(CUSTOM_PRESET)}`,
  "",
  'export default defineConfig({ extends: [custom()], rules: { "no-debugger": "off" } })',
  "",
].join("\n")

// The stub and the optional test that rule add writes must load with custom() and the test presets
// in a real Oxlint run.
describe("rule add stub", () => {
  const rulePath = ".adamantite/lint/no-debugger-here.ts"
  let project: string

  function write(path: string, content: string) {
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), content)
  }

  function lint(...args: string[]) {
    const result = spawnSync(join(REPO_ROOT, "node_modules/.bin/oxlint"), ["-f", "json", ...args], {
      cwd: project,
      encoding: "utf8",
    })

    try {
      return decodeOxlintJsonOutput(result.stdout).diagnostics.map(
        (diagnostic) => `${diagnostic.code}:${diagnostic.severity}`
      )
    } catch (error) {
      throw new Error(`Oxlint did not print JSON diagnostics.\n${result.stdout}${result.stderr}`, {
        cause: error,
      })
    }
  }

  function writeRuleAndVerify(rule: string) {
    write(rulePath, rule)

    const input = [
      `import { RuleTester } from ${JSON.stringify(TESTING_MODULE)}`,
      `import rule from ${JSON.stringify(join(project, rulePath))}`,
      'new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } }).run("no-debugger-here", rule, {',
      '  invalid: [{ code: "debugger", errors: [{ messageId: "unexpected" }] }],',
      '  valid: ["const value: number = 1"],',
      "})",
    ].join("\n")

    return spawnSync(process.execPath, ["--input-type=module"], {
      cwd: project,
      encoding: "utf8",
      input,
    })
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-custom-rules-"))
    // A real node_modules folder keeps the entry modules that custom() writes inside the project.
    mkdirSync(join(project, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxlint"), join(project, "node_modules/oxlint"))
    write("src/index.ts", "export function stop() {\n  debugger\n}\n")
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it("load and run the stub that rule add writes", () => {
    write(rulePath, makeStub())
    write("oxlint.config.ts", CUSTOM_CONFIG)

    expect(lint("src")).toStrictEqual(["project(no-debugger-here):error"])
  })

  it.each(["core", "vitest", "jest"])(
    "lint an optional generated test with the %s preset",
    async (preset) => {
      expect.hasAssertions()

      const files = createFileSystemTestContext({
        files: { [rulePath]: makeStub() },
        root: project,
      })

      const testPath = await Effect.runPromise(
        addCustomRuleTest(project, "no-debugger-here").pipe(
          Effect.provide([files.layer, Path.layer])
        )
      )

      write(rulePath, makeStub())
      write(".adamantite/lint/no-debugger-here.test.ts", files.read(testPath))
      write(
        "oxlint.config.ts",
        [
          `import core from ${JSON.stringify(join(REPO_ROOT, "presets/lint/core.ts"))}`,
          `import testPreset from ${JSON.stringify(join(REPO_ROOT, `presets/lint/${preset}.ts`))}`,
          "export default { extends: [core, testPreset] }",
        ].join("\n")
      )

      expect(lint(".adamantite/lint/no-debugger-here.test.ts")).toStrictEqual([])
    }
  )

  describe("temporary rule verification", () => {
    it("pass from stdin and leave only the rule file", () => {
      const result = writeRuleAndVerify(makeStub())

      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0)
      expect(result.stdout).toContain("✔ const value: number = 1")
      expect(result.stdout).toContain("✔ debugger")
      expect(readdirSync(join(project, ".adamantite/lint"))).toStrictEqual(["no-debugger-here.ts"])
    })

    it("fail and name the case when the rule does not report the invalid code", () => {
      const result = writeRuleAndVerify(makeStub().replace("DebuggerStatement", "WithStatement"))

      expect(result.status).toBe(1)
      expect(result.stdout).toContain("✖ debugger")
      expect(readdirSync(join(project, ".adamantite/lint"))).toStrictEqual(["no-debugger-here.ts"])
    })
  })
})
