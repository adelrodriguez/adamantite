import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import initCommand from "#commands/init/index.ts"
import { toOxfmtTsConfigContent } from "#lib/integrations/tooling/oxfmt/config.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { createDependencyInstallerTestContext, runCommand } from "./command-test-helpers.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

// The project's own `oxfmt.config.ts` imports `adamantite/format`, which the test folder does not
// install, so Oxfmt loads the preset from a config outside the project.
const OXFMT_CONFIG = toOxfmtTsConfigContent().replace(
  '"adamantite/format"',
  JSON.stringify(join(REPO_ROOT, "presets/format.ts"))
)

// The files that `Setup.apply` writes. Each integration that moves to `src/lib/integrations/<name>/`
// adds its managed files.
const FORMATTED_FILES = [LOCKFILE_PATH]

// Every option of init that makes it write a file.
const FULL_SETUP = [
  "--non-interactive",
  "--script",
  "check",
  "--script",
  "fix",
  "--script",
  "analyze",
  "--preset",
  "react",
  "--preset",
  "effect",
  "--typescript",
  "typescript",
  "--editor",
  "vscode",
]

describe("the files that init writes", () => {
  let folder: string

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "adamantite-formatted-"))
    mkdirSync(join(folder, "node_modules"))
    symlinkSync(join(REPO_ROOT, "node_modules/oxfmt"), join(folder, "node_modules/oxfmt"))
  })

  afterEach(() => {
    rmSync(folder, { force: true, recursive: true })
  })

  // `adamantite fix` must leave each file as init wrote it, so its hash still matches the lockfile.
  it.effect("keep their content when Oxfmt formats them with the format preset", () =>
    Effect.gen(function* () {
      const files = createFileSystemTestContext({
        files: { "package.json": '{ "name": "test-project" }\n' },
      })

      const installer = createDependencyInstallerTestContext()
      const exit = yield* runCommand(initCommand, FULL_SETUP, { files, layers: [installer.layer] })

      expect(Exit.isSuccess(exit)).toBe(true)

      const project = join(folder, "project")

      for (const file of FORMATTED_FILES) {
        mkdirSync(dirname(join(project, file)), { recursive: true })
        writeFileSync(join(project, file), files.read(file))
      }

      const config = join(folder, "oxfmt.config.ts")
      writeFileSync(config, OXFMT_CONFIG)

      const result = spawnSync(
        join(REPO_ROOT, "node_modules/.bin/oxfmt"),
        ["--config", config, ...FORMATTED_FILES],
        { cwd: project, encoding: "utf8" }
      )

      expect(result.stderr).toBe("")
      expect(result.status).toBe(0)

      expect(
        Object.fromEntries(
          FORMATTED_FILES.map((file) => [file, readFileSync(join(project, file), "utf8")])
        )
      ).toStrictEqual(Object.fromEntries(FORMATTED_FILES.map((file) => [file, files.read(file)])))
    })
  )
})
