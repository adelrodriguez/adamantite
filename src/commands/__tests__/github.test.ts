import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { hashContent, makeLockfileFile, readLockfile } from "./command-test-helpers.ts"
import { listHashes, makeSelection, runLifecycle } from "./lifecycle.ts"

const WORKFLOW = ".github/workflows/adamantite.yml"

const PACKAGE_JSON =
  '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" }, "scripts": { "check": "adamantite check" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check", "--github-actions"]

const SELECTION = makeSelection({ ci: "github", presets: ["core"], scripts: ["check"] })

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { "package.json": PACKAGE_JSON, ...files } })
}

// The workflow that init writes for the `check` script with bun, the package manager of the tests.
function renderWorkflow() {
  return Effect.gen(function* () {
    const files = makeProject()
    yield* runLifecycle("init", files, INIT_ARGS)

    return files.read(WORKFLOW)
  })
}

describe("GitHub Actions setup", () => {
  it.effect("create the workflow for the CI scripts of the selection and record its hash", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(WORKFLOW)).toContain("command: bun run check")
      expect(readLockfile(files).written[WORKFLOW]).toBe(hashContent(files.read(WORKFLOW)))
      expect(output).toContain(`✔ \`${WORKFLOW}\` created.`)
    })
  )

  it.effect("report the workflow unchanged on a second init", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const before = listHashes(files)

      const { output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(listHashes(files)).toStrictEqual(before)
      expect(output).toContain(`● \`${WORKFLOW}\` is up to date.`)
    })
  )

  // The template has not changed since 0.47.0, so the first update after it records the workflow,
  // and a later template change replaces it (#837).
  it.effect(
    "record a workflow that an earlier release wrote, in a project without a lockfile",
    () =>
      Effect.gen(function* () {
        const workflow = yield* renderWorkflow()
        const files = makeProject({ [WORKFLOW]: workflow })

        const { output } = yield* runLifecycle("update", files)

        expect(readLockfile(files).written[WORKFLOW]).toBe(hashContent(workflow))
        expect(output).toContain(`● \`${WORKFLOW}\` is up to date.`)
      })
  )

  it.effect("replace a workflow whose hash equals the hash that the lockfile recorded", () =>
    Effect.gen(function* () {
      const older = (yield* renderWorkflow()).replace("timeout-minutes: 10", "timeout-minutes: 5")

      const files = makeProject({
        ...makeLockfileFile(SELECTION, { [WORKFLOW]: hashContent(older) }),
        [WORKFLOW]: older,
      })

      const { output } = yield* runLifecycle("update", files)

      expect(files.read(WORKFLOW)).toBe(yield* renderWorkflow())
      expect(output).toContain(`✔ \`${WORKFLOW}\` replaced with the current version.`)
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

  // Releases before the lockfile let the project rename the workflow.
  it.effect("write no second workflow beside one that the project renamed", () =>
    Effect.gen(function* () {
      const renamed = ".github/workflows/ci.yml"
      const files = makeProject({ [renamed]: yield* renderWorkflow() })

      yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.exists(WORKFLOW)).toBe(false)
      expect(doctor.output).not.toContain("Adamantite workflow")
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
