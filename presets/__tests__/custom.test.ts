import { spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../..")
const CUSTOM_PRESET = join(REPO_ROOT, "presets/rules/index.ts")
const RULES_MODULE = join(REPO_ROOT, "presets/rules/plugin.ts")

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      severity: Schema.String,
    })
  ),
})

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

  it("enable each rule file in .adamantite/lint and skip helper files", () => {
    write(".adamantite/lint/no-debugger-here.ts", makeRule("No debugger here."))
    // A helper without a default export fails the run if it loads as a rule.
    write(".adamantite/lint/_helpers.ts", "export const helper = 1\n")
    // Optional tests must not run or become rules when the plugin loads.
    write(".adamantite/lint/no-debugger-here.test.ts", 'throw new Error("Test was loaded")\n')
    write(".adamantite/lint/AGENTS.md", "# Custom rules\n")
    write("oxlint.config.ts", makeConfig("custom()"))

    expect(lint("src")).toStrictEqual(["project(no-debugger-here):error"])
  })

  it("fail the run when two files in a rules folder define one rule", () => {
    write(".adamantite/lint/no-debugger-here.ts", makeRule("No debugger here."))
    write(".adamantite/lint/no-debugger-here.js", "export default {}\n")
    write("oxlint.config.ts", makeConfig("custom()"))

    expect(() => lint("src")).toThrow(
      /has more than one file for the rule `no-debugger-here`: no-debugger-here\.(?:js, no-debugger-here\.ts|ts, no-debugger-here\.js)\. Keep one of them\./
    )
  })

  it("apply severity overrides from the rules option", () => {
    write(".adamantite/lint/no-debugger-here.ts", makeRule("No debugger here."))
    write("oxlint.config.ts", makeConfig('custom({ rules: { "no-debugger-here": "warn" } })'))

    expect(lint("src")).toStrictEqual(["project(no-debugger-here):warning"])
  })

  it("return an empty config without a rules folder", () => {
    write("oxlint.config.ts", makeConfig("custom()"))

    expect(lint("src")).toStrictEqual([])
  })

  // Adamantite loads the config and reads this identity to find each rules folder that the config
  // reaches, as `presets/identity.ts` describes.
  it("name the rules folder, the plugin, and the caller of each call, also without a folder", () => {
    write(".adamantite/lint/no-debugger-here.ts", makeRule("No debugger here."))
    write(
      "tooling/lint/index.ts",
      [
        `import custom from ${JSON.stringify(CUSTOM_PRESET)}`,
        "",
        'export const missing = custom({ dir: "rules", name: "acme" })',
        "",
      ].join("\n")
    )
    write(
      "oxlint.config.ts",
      makeConfig("custom(), missing", ['import { missing } from "./tooling/lint/index.ts"'])
    )

    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        'const { default: config } = await import(process.argv[1]); console.log(JSON.stringify(config.extends.map((entry) => entry[Symbol.for("adamantite.preset")])))',
        pathToFileURL(join(project, "oxlint.config.ts")).href,
      ],
      { cwd: project, encoding: "utf8" }
    )

    // Node.js names a module by its real path, and the temporary folder can be a link.
    const root = realpathSync(project)

    expect(JSON.parse(result.stdout)).toStrictEqual([
      {
        caller: join(root, "oxlint.config.ts"),
        dir: join(root, ".adamantite/lint"),
        module: "adamantite/rules",
        name: "project",
      },
      {
        caller: join(root, "tooling/lint/index.ts"),
        dir: join(root, "tooling/lint/rules"),
        module: "adamantite/rules",
        name: "acme",
      },
    ])
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
    write(".adamantite/lint/no-debugger-here.ts", makeRule("No debugger here."))
    write("packages/web/.adamantite/lint/no-debugger-in-web.ts", makeRule("No debugger in web."))
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

  it("give each Adamantite copy its own entry module for one rules folder", () => {
    write(".adamantite/lint/no-debugger-here.ts", makeRule("No debugger here."))

    // Two installed copies, such as two versions in a monorepo, load the same rules folder. Each
    // entry module imports `loadRules` from its own copy, so the copies must not share the file.
    const results = ["a", "b"].map((copy) => {
      for (const file of ["custom.ts", "folder.ts"]) {
        write(
          `copies/${copy}/${file}`,
          readFileSync(join(REPO_ROOT, "presets/rules", file), "utf8")
        )
      }

      write("copies/identity.ts", readFileSync(join(REPO_ROOT, "presets/identity.ts"), "utf8"))

      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          [
            `import custom from ${JSON.stringify(pathToFileURL(join(project, `copies/${copy}/custom.ts`)).href)}`,
            `console.log(custom({ dir: ${JSON.stringify(join(project, ".adamantite/lint"))} }).jsPlugins[0].specifier)`,
          ].join("\n"),
        ],
        { encoding: "utf8" }
      )

      return { error: result.stderr, specifier: result.stdout.trim() }
    })

    const specifiers = results.map((result) => result.specifier)

    expect(results.map((result) => result.error)).toStrictEqual(["", ""])
    expect(new Set(specifiers).size).toBe(2)
    expect(
      EffectArray.sort(readdirSync(join(project, "node_modules/.cache/adamantite")), Order.String)
    ).toStrictEqual(
      EffectArray.sort(
        specifiers.map((specifier) => basename(fileURLToPath(specifier))),
        Order.String
      )
    )
  })
})

/**
 * The fallback folder of `custom()` for the current user. The tests that use it skip Windows.
 */
function getPrivateFolderName() {
  return `adamantite-${process.geteuid?.() ?? 0}`
}

// The shared temporary directory can hold files of other users, so the fallback entry module must
// go to a folder that only this user can write. A child process gets its own TMPDIR.
describe.skipIf(process.platform === "win32")("custom preset without node_modules", () => {
  let temporary: string
  let rules: string

  beforeEach(() => {
    temporary = mkdtempSync(join(tmpdir(), "adamantite-shared-tmp-"))
    rules = join(temporary, "project/.adamantite/lint")
    mkdirSync(rules, { recursive: true })
    writeFileSync(join(rules, "no-debugger-here.ts"), "export default {}\n")
  })

  afterEach(() => {
    rmSync(temporary, { force: true, recursive: true })
  })

  function writeEntryModule(setup: readonly string[] = []) {
    return spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        [
          ...setup,
          `const { default: custom } = await import(${JSON.stringify(pathToFileURL(CUSTOM_PRESET).href)})`,
          `console.log(custom({ dir: ${JSON.stringify(rules)} }).jsPlugins[0].specifier)`,
        ].join("\n"),
      ],
      { encoding: "utf8", env: { ...process.env, TMPDIR: temporary } }
    )
  }

  it("write the entry module to a folder that only this user can write", () => {
    // Another user could create the shared folder first and replace the module after the write.
    const shared = join(temporary, "adamantite")
    mkdirSync(shared)
    chmodSync(shared, 0o777)

    const result = writeEntryModule()
    const folder = dirname(fileURLToPath(result.stdout.trim()))

    expect(result.stderr).toBe("")
    expect(folder).not.toBe(shared)
    expect(statSync(folder).mode & 0o077).toBe(0)
  })

  it("work for a user without an account entry, as in a container", () => {
    // `os.userInfo()` throws when the user ID has no passwd entry, such as with `docker --user`.
    const result = writeEntryModule([
      'import os from "node:os"',
      'import { syncBuiltinESMExports } from "node:module"',
      'os.userInfo = () => { throw new Error("no passwd entry") }',
      "syncBuiltinESMExports()",
    ])

    expect(result.stderr).toBe("")
    expect(dirname(fileURLToPath(result.stdout.trim()))).toBe(
      join(temporary, getPrivateFolderName())
    )
  })

  it("refuse a fallback folder that another user can write", () => {
    const folder = join(temporary, getPrivateFolderName())
    mkdirSync(folder)
    chmodSync(folder, 0o777)

    const result = writeEntryModule()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("custom() could not write the entry module")
  })
})
