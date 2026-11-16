import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import type { Selection } from "#lib/project/selection.ts"
import {
  getOxlintCommand,
  getProjectDirectory,
  PROJECT_VARIABLE,
} from "#lib/integrations/oxlint/entry.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"

const ENTRY = join(import.meta.dirname, "../../../../oxlint.ts")

/**
 * What the entry prints to standard error, and its exit code, in a project without Oxlint whose
 * lockfile selects `scripts`.
 */
function runWithoutOxlint(scripts: Selection["scripts"]) {
  const project = mkdtempSync(join(tmpdir(), "adamantite-entry-"))

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
      env: { ...process.env, [PROJECT_VARIABLE]: project },
    })

    return { exitCode: result.status, stderr: result.stderr.replaceAll(project, "<project>") }
  } finally {
    rmSync(project, { force: true, recursive: true })
  }
}

const CWD = "/somewhere/else"

describe("oxlint-entry", () => {
  describe("getProjectDirectory", () => {
    it("take the folder above node_modules for an installed entry", () => {
      expect(getProjectDirectory("/project/node_modules/adamantite/dist/oxlint.js", CWD)).toBe(
        "/project"
      )
    })

    it("take the folder above the first node_modules for an entry in the pnpm store", () => {
      expect(
        getProjectDirectory(
          "/project/node_modules/.pnpm/adamantite@1.0.0/node_modules/adamantite/dist/oxlint.js",
          CWD
        )
      ).toBe("/project")
    })

    it("take the workspace package that installs the entry", () => {
      expect(
        getProjectDirectory("/project/packages/web/node_modules/adamantite/dist/oxlint.js", CWD)
      ).toBe("/project/packages/web")
    })

    it("take the folder above node_modules for a Windows path", () => {
      expect(
        getProjectDirectory("C:\\project\\node_modules\\adamantite\\dist\\oxlint.js", CWD)
      ).toBe("C:\\project")
    })

    it("take the project that a command names, also for an entry in a package runner cache", () => {
      expect(
        getProjectDirectory(
          "/home/user/.npm/_npx/1a2b/node_modules/adamantite/dist/oxlint.js",
          CWD,
          "/project"
        )
      ).toBe("/project")
    })

    it("take the working directory for an entry outside node_modules", () => {
      expect(getProjectDirectory("/adamantite/src/oxlint.ts", CWD)).toBe(CWD)
    })
  })

  describe("getOxlintCommand", () => {
    it("start the entry beside the CLI module with Node.js, and name the project", () => {
      expect(getOxlintCommand("/project")).toStrictEqual({
        args: [expect.stringMatching(/[/\\]oxlint\.js$/u)],
        command: "node",
        cwd: "/project",
        env: { ADAMANTITE_PROJECT: "/project" },
        name: "oxlint",
      })
    })
  })

  describe("a project without Oxlint", () => {
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
})
