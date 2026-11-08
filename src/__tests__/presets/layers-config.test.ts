import type { Options } from "@oxlint/plugins"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "@effect/vitest"

const REPO = join(import.meta.dirname, "../../..")
const MAP = {
  layers: {
    lib: { imports: [], layers: { workspace: { imports: [] } } },
  },
  root: "src",
}

function lint(options: Readonly<Options>) {
  const fixture = mkdtempSync(join(tmpdir(), "adamantite-layers-config-"))

  try {
    mkdirSync(join(fixture, "src/lib/workspace"), { recursive: true })
    writeFileSync(join(fixture, "package.json"), '{"type":"module"}\n')
    writeFileSync(join(fixture, "src/lib/workspace/value.ts"), "export const value = 1\n")
    writeFileSync(
      join(fixture, "oxlint.config.json"),
      JSON.stringify({
        jsPlugins: [
          {
            name: "adamantite",
            specifier: pathToFileURL(join(REPO, "presets/lint/plugin/index.ts")).href,
          },
        ],
        rules: { "adamantite/layers": ["error", ...options] },
      })
    )

    const result = spawnSync(
      join(REPO, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.json", "-f", "json", "src"],
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

describe("layers option validation in Oxlint", () => {
  it("accept nested maps", () => {
    expect(lint([MAP]).status).toBe(0)
  })

  it.each([
    { name: "old dependency arrays", options: [{ layers: { workspace: [] }, root: "src/lib" }] },
    { name: "missing imports", options: [{ layers: { lib: {} }, root: "src" }] },
    {
      name: "leaf settings without a child map",
      options: [{ layers: { lib: { ignore: ["**"], imports: [] } }, root: "src" }],
    },
    { name: "missing roots", options: [{ layers: {} }] },
    {
      name: "malformed nested imports",
      options: [
        {
          layers: { lib: { imports: [], layers: { workspace: { imports: "shared" } } } },
          root: "src",
        },
      ],
    },
  ])("reject $name with a nonzero exit", ({ options }) => {
    const result = lint(options)

    expect(result.status).toBe(1)
    expect(result.stdout).toContain("Options validation failed")
  })

  it("reject duplicate scopes with a nonzero exit", () => {
    const result = lint([MAP, { layers: { workspace: { imports: [] } }, root: "src/lib" }])

    expect(result.status).toBe(1)
    expect(result.stdout).toContain("more than one layer map")
  })
})
