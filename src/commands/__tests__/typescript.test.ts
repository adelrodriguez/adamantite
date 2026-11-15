import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { Report } from "#commands/doctor.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { formatJson } from "#lib/shared/json.ts"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "./command-test-helpers.ts"
import { listHashes, makeSelection, runLifecycle } from "./lifecycle.ts"

const CONFIG = "tsconfig.json"

const decodeReport = Schema.decodeUnknownSync(Schema.fromJsonString(Report))

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const MONOREPO_PACKAGE_JSON =
  '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" }, "workspaces": ["packages/*"] }\n'

const INIT_ARGS = ["--non-interactive", "--typescript", "typescript"]

// The tests install no Oxfmt, so Setup writes each file as rendered.
const RENDERED = `${Effect.runSync(formatJson({ extends: "adamantite/typescript" }))}\n`

const WITH_EFFECT = `${Effect.runSync(
  formatJson({
    compilerOptions: { plugins: [{ diagnostics: true, name: "@effect/language-service" }] },
    extends: "adamantite/typescript",
  })
)}\n`

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { "package.json": PACKAGE_JSON, ...files } })
}

describe("TypeScript setup", () => {
  it.effect("create the config of the selected preset and record its hash", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect({
        config: files.read(CONFIG),
        recorded: readLockfile(files).written[CONFIG],
        succeeded: Exit.isSuccess(exit),
      }).toStrictEqual({ config: RENDERED, recorded: hashContent(RENDERED), succeeded: true })
      expect(output).toContain(`✔ \`${CONFIG}\` created.`)
    })
  )

  it.effect("add the Effect language service entry for the effect preset", () =>
    Effect.gen(function* () {
      const files = makeProject()

      yield* runLifecycle("init", files, [...INIT_ARGS, "--script", "check", "--preset", "effect"])

      expect(files.read(CONFIG)).toBe(WITH_EFFECT)
    })
  )

  it.effect("report the config unchanged on a second init", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const before = listHashes(files)

      const { output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(listHashes(files)).toStrictEqual(before)
      expect(output).toContain(`● \`${CONFIG}\` is up to date.`)
    })
  )

  // Adamantite never merges the preset into a config that it did not write.
  it.effect("keep a config that the project wrote, and report the missing preset in doctor", () =>
    Effect.gen(function* () {
      const own = '{\n  // Strict options\n  "compilerOptions": { "strict": true },\n}\n'
      const files = makeProject({ [CONFIG]: own })

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(CONFIG)).toBe(own)
      expect(init.output).toContain(`● \`${CONFIG}\` kept, because it has changes`)
      expect(doctor.output).toContain("Missing TypeScript preset")
    })
  )

  // TypeScript follows `extends` through the base config, and so does Doctor.
  it.effect.each([
    { finding: undefined, preset: "tsconfig" },
    { finding: "Mismatched TypeScript preset", preset: "typescript" },
  ] as const)(
    "find adamantite/tsconfig through a shared base config when the lockfile selects $preset",
    ({ finding, preset }) =>
      Effect.gen(function* () {
        const files = makeProject({
          ...makeLockfileFile(makeSelection({ typescript: preset })),
          [CONFIG]: '{ "extends": "./tsconfig.base.json", "include": ["src"] }\n',
          "tsconfig.base.json": '{ "extends": "adamantite/tsconfig" }\n',
        })

        const doctor = yield* runLifecycle("doctor", files, ["--json"])
        const { findings } = decodeReport(doctor.output)

        expect(findings.map(({ title }) => title)).toStrictEqual(
          finding === undefined ? [] : [finding]
        )
      })
  )

  // An earlier version wrote the config before the selection added the effect preset (#837).
  it.effect("replace a config whose hash equals the hash that the lockfile recorded", () =>
    Effect.gen(function* () {
      const selection = makeSelection({
        presets: ["core", "effect"],
        scripts: ["check"],
        typescript: "typescript",
      })

      const files = makeProject({
        ...makeLockfileFile(selection, { [CONFIG]: hashContent(RENDERED) }),
        [CONFIG]: RENDERED,
      })

      const { output } = yield* runLifecycle("update", files)

      expect(files.read(CONFIG)).toBe(WITH_EFFECT)
      expect(output).toContain(`✔ \`${CONFIG}\` replaced with the current version.`)
    })
  )

  it.effect("delete the config when the selection no longer names a TypeScript preset", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const { written } = readLockfile(files)

      files.write(
        LOCKFILE_PATH,
        makeLockfileFile(makeSelection({ scripts: ["analyze"] }), written)[LOCKFILE_PATH]
      )

      yield* runLifecycle("update", files)

      expect(files.exists(CONFIG)).toBe(false)
    })
  )

  // A root config that extends a preset makes TypeScript treat all packages as one project.
  it.effect("write no root config in a monorepo, and report the packages in doctor", () =>
    Effect.gen(function* () {
      const files = makeProject({ "package.json": MONOREPO_PACKAGE_JSON })

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({ config: files.exists(CONFIG), failure: getFailure(init.exit) }).toStrictEqual({
        config: false,
        failure: findingsLeft("init"),
      })
      expect(doctor.output).toContain(
        "no `tsconfig.json` of the root or the workspace packages extends an Adamantite TypeScript preset."
      )
    })
  )

  // Other configs can extend the root config, so Adamantite keeps it.
  it.effect("keep managing a root config that it wrote before the project became a monorepo", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write("package.json", MONOREPO_PACKAGE_JSON)

      const { output } = yield* runLifecycle("update", files)

      expect({
        config: files.read(CONFIG),
        recorded: readLockfile(files).written[CONFIG],
      }).toStrictEqual({ config: RENDERED, recorded: hashContent(RENDERED) })
      expect(output).toContain(`● \`${CONFIG}\` is up to date.`)
    })
  )
})
