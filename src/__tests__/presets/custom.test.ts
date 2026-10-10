import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const CUSTOM_PRESET = join(REPO_ROOT, "presets/lint/custom.ts")
const RULES_MODULE = join(REPO_ROOT, "presets/rules/index.ts")

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      severity: Schema.String,
    })
  ),
})

const hasBun = spawnSync("bun", ["--version"]).status === 0

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

/**
 * A rule that reports every `debugger` statement with the given message.
 */
function makeRule(message: string) {
  return [
    `import { defineRule } from ${JSON.stringify(RULES_MODULE)}`,
    "",
    "export default defineRule({",
    "  meta: {",
    `    messages: { unexpected: ${JSON.stringify(message)} },`,
    '    type: "problem",',
    "  },",
    "  createOnce(context) {",
    "    return {",
    "      DebuggerStatement(node) {",
    '        context.report({ messageId: "unexpected", node })',
    "      },",
    "    }",
    "  },",
    "})",
    "",
  ].join("\n")
}

function makeConfig(customCall: string, imports: readonly string[] = []) {
  return [
    'import { defineConfig } from "oxlint"',
    `import custom from ${JSON.stringify(CUSTOM_PRESET)}`,
    ...imports,
    "",
    `export default defineConfig({ extends: [${customCall}], rules: { "no-debugger": "off" } })`,
    "",
  ].join("\n")
}

describe("custom preset", () => {
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

  it("enable each rule file in .adamantite/rules and skip helper files", () => {
    write(".adamantite/rules/no-debugger-here.ts", makeRule("No debugger here."))
    // A helper without a default export fails the run if it loads as a rule.
    write(".adamantite/rules/_helpers.ts", "export const helper = 1\n")
    write(".adamantite/rules/AGENTS.md", "# Custom rules\n")
    write("oxlint.config.ts", makeConfig("custom()"))

    expect(lint("src")).toStrictEqual(["project(no-debugger-here):error"])
  })

  it("resolve the rules folder from the config file, not the working directory", () => {
    write(".adamantite/rules/no-debugger-here.ts", makeRule("No debugger here."))
    write("oxlint.config.ts", makeConfig("custom()"))

    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-f", "json", "-c", join(project, "oxlint.config.ts"), "."],
      { cwd: join(project, "src"), encoding: "utf8" }
    )

    expect(result.stdout).toContain("project(no-debugger-here)")
  })

  it("apply severity overrides from the rules option", () => {
    write(".adamantite/rules/no-debugger-here.ts", makeRule("No debugger here."))
    write("oxlint.config.ts", makeConfig('custom({ rules: { "no-debugger-here": "warn" } })'))

    expect(lint("src")).toStrictEqual(["project(no-debugger-here):warning"])
  })

  it("return an empty config without a rules folder", () => {
    write("oxlint.config.ts", makeConfig("custom()"))

    expect(lint("src")).toStrictEqual([])
  })

  it("load a rules folder from a shared tooling package under its own name", () => {
    // A monorepo keeps its lint config and rules in a tooling package. The relative `dir` resolves
    // from the tooling config, so every package that extends it loads the same rules.
    write("tooling/lint/rules/no-debugger-here.ts", makeRule("No debugger here."))
    write(
      "tooling/lint/index.ts",
      [
        `import custom from ${JSON.stringify(CUSTOM_PRESET)}`,
        "",
        'export default custom({ dir: "rules", name: "acme" })',
        "",
      ].join("\n")
    )
    write(
      "oxlint.config.ts",
      makeConfig("tooling", ['import tooling from "./tooling/lint/index.ts"'])
    )
    write("packages/web/src/index.ts", "export function stop() {\n  debugger\n}\n")

    expect(lint("src", "packages")).toStrictEqual([
      "acme(no-debugger-here):error",
      "acme(no-debugger-here):error",
    ])
  })

  it("load one rules folder per workspace package under distinct names", () => {
    write(".adamantite/rules/no-debugger-here.ts", makeRule("No debugger here."))
    write("packages/web/.adamantite/rules/no-debugger-in-web.ts", makeRule("No debugger in web."))
    write("oxlint.config.ts", makeConfig("custom()"))
    // A nested config replaces the root config, so the package extends the root rules too.
    write(
      "packages/web/oxlint.config.ts",
      makeConfig('root, custom({ name: "web" })', ['import root from "../../oxlint.config.ts"'])
    )
    write("packages/web/src/index.ts", "export function stop() {\n  debugger\n}\n")

    expect(EffectArray.sort(lint("packages"), Order.String)).toStrictEqual([
      "project(no-debugger-here):error",
      "web(no-debugger-in-web):error",
    ])
  })

  // Bun prints stack frames as plain paths, where Node.js prints file URLs.
  it.skipIf(!hasBun)("resolve the rules folder from the calling file under Bun", () => {
    write("tooling/lint/rules/no-debugger-here.ts", makeRule("No debugger here."))
    write(
      "tooling/lint/index.ts",
      [
        `import custom from ${JSON.stringify(CUSTOM_PRESET)}`,
        "",
        'console.log(JSON.stringify(custom({ dir: "rules" }).rules))',
        "",
      ].join("\n")
    )

    const result = spawnSync("bun", [join(project, "tooling/lint/index.ts")], {
      cwd: project,
      encoding: "utf8",
    })

    expect(result.stderr).toBe("")
    expect(result.stdout.trim()).toBe('{"project/no-debugger-here":"error"}')
  })
})
