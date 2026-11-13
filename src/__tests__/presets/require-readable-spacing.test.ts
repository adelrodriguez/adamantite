import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"

// RuleTester checks each fix once. This test runs the fix through the Oxlint CLI on several files,
// and checks that a second fix changes nothing.
const REPO_ROOT = join(import.meta.dirname, "../../..")
const PLUGIN = join(REPO_ROOT, "presets/lint/plugin/antislop/index.ts")

let probeRoot: string

function lint(...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [join(REPO_ROOT, "src/oxlint.ts"), "--config", "oxlint.json", ...args, "first.ts", "second.ts"],
    { cwd: probeRoot, encoding: "utf8" }
  )

  return { output: `${result.stdout}\n${result.stderr}`, status: result.status }
}

function readProbe() {
  return ["first.ts", "second.ts"].map((file) => readFileSync(join(probeRoot, file), "utf8"))
}

describe("anti-slop/require-readable-spacing through the Oxlint CLI", () => {
  beforeEach(() => {
    probeRoot = mkdtempSync(join(tmpdir(), "adamantite-readable-spacing-"))
    // The Oxlint entry resolves Oxlint from the project that it lints.
    symlinkSync(join(REPO_ROOT, "node_modules"), join(probeRoot, "node_modules"))
    writeFileSync(
      join(probeRoot, "oxlint.json"),
      JSON.stringify({
        jsPlugins: [{ name: "anti-slop", specifier: PLUGIN }],
        rules: { "anti-slop/require-readable-spacing": "error" },
      })
    )
    writeFileSync(
      join(probeRoot, "first.ts"),
      "export const a = 1;\n/** Attached to b. */\nexport const b = 2;\n"
    )
    writeFileSync(
      join(probeRoot, "second.ts"),
      "export function f() {\nconst a = 1;\nconst b = 2;\nreturn a + b;\n}\n"
    )
  })

  afterEach(() => {
    rmSync(probeRoot, { force: true, recursive: true })
  })

  it("report the files before the fix", () => {
    const rejected = lint()

    expect(rejected).toMatchObject({ status: 1 })
    expect(rejected.output).toContain("require-readable-spacing")
  })

  it("fix the files, and then accept them", () => {
    expect(lint("--fix")).toMatchObject({ status: 0 })
    expect(readProbe()).toStrictEqual([
      "export const a = 1;\n\n/** Attached to b. */\nexport const b = 2;\n",
      "export function f() {\nconst a = 1;\nconst b = 2;\n\nreturn a + b;\n}\n",
    ])
    expect(lint()).toMatchObject({ status: 0 })
  })

  it("change nothing on a second fix", () => {
    lint("--fix")
    const fixed = readProbe()

    expect(lint("--fix")).toMatchObject({ status: 0 })
    expect(readProbe()).toStrictEqual(fixed)
  })
})
