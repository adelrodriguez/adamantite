import type { Options } from "@oxlint/plugins"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "@effect/vitest"

const REPO = join(import.meta.dirname, "../../..")

function lint(options: Readonly<Options>) {
  const fixture = mkdtempSync(join(tmpdir(), "adamantite-safety-comment-config-"))

  try {
    writeFileSync(join(fixture, "package.json"), '{"type":"module"}\n')
    writeFileSync(
      join(fixture, "value.spec.ts"),
      "declare const input: unknown\n// WHY: The test owns this input.\nexport const value = input as number\n"
    )
    writeFileSync(
      join(fixture, "oxlint.config.json"),
      JSON.stringify({
        jsPlugins: [
          {
            name: "anti-slop",
            specifier: pathToFileURL(join(REPO, "presets/lint/plugins/anti-slop/index.ts")).href,
          },
        ],
        rules: { "anti-slop/require-safety-comment-for-type-assertion": ["error", ...options] },
      })
    )

    const result = spawnSync(
      join(REPO, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.json", "-f", "json", "value.spec.ts"],
      { cwd: fixture, encoding: "utf8" }
    )

    if (result.error) {
      throw result.error
    }

    return result
  } finally {
    rmSync(fixture, { force: true, recursive: true })
  }
}

describe("require-safety-comment-for-type-assertion option validation in Oxlint", () => {
  it.each([
    { name: "one marker", options: [{ markers: ["WHY"] }] },
    { name: "a marker with outer spaces", options: [{ markers: [" WHY "] }] },
  ])("accept $name", ({ options }) => {
    expect(lint(options).status).toBe(0)
  })

  it.each([
    { name: "a blank marker", options: [{ markers: ["  "] }] },
    { name: "a blank marker after a valid one", options: [{ markers: ["WHY", " "] }] },
  ])("reject $name with a nonzero exit", ({ options }) => {
    const result = lint(options)

    expect(result.status).toBe(1)
    expect(result.stdout).toContain("Options validation failed")
  })
})
