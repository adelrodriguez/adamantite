import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Yaml from "effect/encoding/Yaml"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  createDependencyInstallerTestContext,
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
  runCommand,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { runLifecycle } from "#__tests__/lifecycle.ts"
import initCommand from "#commands/init.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { SUPPORTED_PACKAGE_MANAGERS } from "#lib/project/package-manager.ts"

const WORKFLOW = ".github/workflows/adamantite.yml"

const Workflow = Schema.Struct({
  jobs: Schema.Struct({
    verify: Schema.Struct({
      steps: Schema.Array(
        Schema.Struct({
          run: Schema.optionalKey(Schema.String),
          uses: Schema.optionalKey(Schema.String),
          with: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
        })
      ),
    }),
  }),
})

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

  // zizmor's `artipacked` and `template-injection` audits: the checkout token must not stay in
  // `.git/config`, and no expression may expand into a shell script.
  it.effect.each(SUPPORTED_PACKAGE_MANAGERS)(
    "drop the checkout token and keep expressions out of run scripts for %s",
    (name) =>
      Effect.gen(function* () {
        const files = makeProject()

        const installer = createDependencyInstallerTestContext({
          detectedPackageManager: Option.some({ name }),
        })

        yield* runCommand(initCommand, INIT_ARGS, { files, layers: [installer.layer] })

        const { jobs } = yield* Schema.decodeUnknownEffect(Workflow)(
          Yaml.parse(files.read(WORKFLOW))
        )

        const steps = jobs.verify.steps

        expect(
          steps.find((step) => step.uses?.startsWith("actions/checkout@"))?.with
        ).toStrictEqual({ "persist-credentials": false })
        expect(steps.filter((step) => step.run?.includes("${{"))).toStrictEqual([])
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
