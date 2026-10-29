import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FORMAT_PRESET = join(REPO_ROOT, "presets/format.ts")

describe("format preset", () => {
  let project: string

  function format(source: string) {
    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxfmt"),
      ["--stdin-filepath", "index.ts"],
      { cwd: project, encoding: "utf8", input: source }
    )

    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)

    return result.stdout
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-format-"))
    mkdirSync(join(project, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxfmt"), join(project, "node_modules/oxfmt"))
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it("load the config that init writes and apply the preset", () => {
    writeFileSync(
      join(project, "oxfmt.config.ts"),
      toOxfmtTsConfigContent().replace('"adamantite/format"', JSON.stringify(FORMAT_PRESET))
    )

    // The preset sets `semi: false`. Without it, Oxfmt keeps the semicolon.
    expect(format('const greeting = "hello";\n')).toBe('const greeting = "hello"\n')
  })
})
