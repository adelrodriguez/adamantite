import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const CORE_PRESET = join(REPO_ROOT, "presets/lint/core.ts")

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ diagnostics: Schema.Array(Schema.Struct({ code: Schema.String })) })
  )
)

/**
 * Lint one file with the core preset in one real Oxlint run, through the Oxlint entry. The config
 * turns on the type-aware rules, as the config that init writes does.
 */
function lint(source: string) {
  const project = mkdtempSync(join(tmpdir(), "adamantite-core-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(project, "node_modules"))
    writeFileSync(join(project, "index.ts"), source)
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "fixture", type: "module" })
    )
    writeFileSync(
      join(project, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { module: "esnext", moduleResolution: "bundler", strict: true },
      })
    )
    writeFileSync(
      join(project, "oxlint.config.ts"),
      [
        `import core from ${JSON.stringify(CORE_PRESET)}`,
        "",
        "export default { extends: [core], options: { typeAware: true } }",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, "src/oxlint.ts"), "-c", "oxlint.config.ts", "-f", "json", "index.ts"],
      { cwd: project, encoding: "utf8" }
    )

    return decodeOxlintJsonOutput(result.stdout).diagnostics.map((diagnostic) => diagnostic.code)
  } finally {
    rmSync(project, { force: true, recursive: true })
  }
}

describe("core preset", () => {
  // `no-await-in-loop` tells the author to start the calls together. That is a defect when each
  // call needs the result of the call before it, and a lint rule cannot tell the two cases apart.
  it("accept an await in a loop", () => {
    const codes = lint(
      [
        "export async function send(urls: readonly string[]) {",
        "  for (const url of urls) {",
        "    await fetch(url)",
        "  }",
        "}",
        "",
      ].join("\n")
    )

    expect(codes).toStrictEqual([])
  })

  // `typescript/only-throw-error` reads the type of the thrown value, so it reports every throw
  // that `no-throw-literal` reports. With both rules on, one throw needs two suppressions.
  it("report a thrown value that is not an error one time", () => {
    const codes = lint(["export function fail(): never {", '  throw "failed"', "}", ""].join("\n"))

    expect(codes).toStrictEqual(["typescript(only-throw-error)"])
  })
})
