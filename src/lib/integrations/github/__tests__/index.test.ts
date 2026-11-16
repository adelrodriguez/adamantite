import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { runLifecycle } from "#__tests__/lifecycle.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"

const WORKFLOW = ".github/workflows/adamantite.yml"

const PACKAGE_JSON =
  '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" }, "scripts": { "check": "adamantite check" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check", "--github-actions"]

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { "package.json": PACKAGE_JSON, ...files } })
}

describe("GitHub Actions setup", () => {
  it.effect("create the workflow for the CI scripts of the selection and record its hash", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(WORKFLOW)).toContain("command: bun run check")
      expect(readLockfile(files).written[WORKFLOW]).toBe(hashContent(files.read(WORKFLOW)))
      expect(output).toContain(`✔ \`${WORKFLOW}\` created.`)
    })
  )

  it.effect("keep a workflow that the project changed, and report a missing check job", () =>
    Effect.gen(function* () {
      const workflow =
        "name: team checks\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: bun test\n"

      const files = makeProject({ [WORKFLOW]: workflow })

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(WORKFLOW)).toBe(workflow)
      expect(init.output).toContain(`● \`${WORKFLOW}\` kept, because it has changes`)
      expect(doctor.output).toContain(
        `No job in \`${WORKFLOW}\` runs the managed \`check\` script.`
      )
    })
  )

  it.effect("delete the workflow when the selection no longer names GitHub Actions", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const { selection, written } = readLockfile(files)

      files.write(
        LOCKFILE_PATH,
        makeLockfileFile({ ...selection, ci: null }, written)[LOCKFILE_PATH]
      )

      yield* runLifecycle("update", files)

      expect(files.exists(WORKFLOW)).toBe(false)
    })
  )
})
