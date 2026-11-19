import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import type { Selection } from "#lib/project/selection.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"

const ENTRY = join(import.meta.dirname, "../index.ts")

function runWithoutOxlint(scripts: Selection["scripts"]) {
  // The working directory of a process is a real path.
  const project = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-entry-")))

  try {
    mkdirSync(join(project, ".adamantite"))
    writeFileSync(
      join(project, LOCKFILE_PATH),
      JSON.stringify({
        schemaVersion: 1,
        selection: { agents: false, ci: null, editors: [], presets: [], scripts, typescript: null },
        version: "0.0.0",
        written: {},
      })
    )

    const result = spawnSync(process.execPath, [ENTRY], {
      cwd: project,
      encoding: "utf8",
    })

    return { exitCode: result.status, stderr: result.stderr.replaceAll(project, "<project>") }
  } finally {
    rmSync(project, { force: true, recursive: true })
  }
}

describe("the Oxlint entry in a project without Oxlint", () => {
  it("name the init command when the lockfile selects no script that runs Oxlint", () => {
    expect(runWithoutOxlint(["analyze"])).toStrictEqual({
      exitCode: 1,
      stderr:
        "The lockfile selects no script that runs `oxlint`, so `oxlint` is not installed. Run `adamantite init --non-interactive --script check` to add the script and install it.\n",
    })
  })

  it("name adamantite update when the lockfile selects a script that runs Oxlint", () => {
    expect(runWithoutOxlint(["check"])).toStrictEqual({
      exitCode: 1,
      stderr:
        "`oxlint` is not installed in `<project>`. Install the dependencies, or run `adamantite update`.\n",
    })
  })
})
