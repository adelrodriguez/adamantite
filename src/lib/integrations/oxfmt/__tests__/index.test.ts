import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import {
  findingsLeft,
  getFailure,
  makeLockfileFile,
  readLockfile,
} from "#__tests__/command-test-helpers.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection, runLifecycle } from "#__tests__/lifecycle.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"

const CONFIG = "oxfmt.config.ts"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check"]

const RENDERED =
  'import format from "adamantite/format"\nimport { defineConfig } from "oxfmt"\n\nexport default defineConfig(format)\n'

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

describe("Oxfmt setup", () => {
  it.effect("create the config", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect({
        config: files.read(CONFIG),
        failure: getFailure(exit),
      }).toStrictEqual({
        config: RENDERED,
        failure: findingsLeft("init"),
      })
      expect(output).toContain(`✔ \`${CONFIG}\` created.`)
    })
  )

  it.effect("keep a config that the user changed, and report one without the preset", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)

      const edited = 'import { defineConfig } from "oxfmt"\n\nexport default defineConfig({})\n'
      files.write(CONFIG, edited)

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({
        config: files.read(CONFIG),
        recorded: Object.hasOwn(readLockfile(files).written, CONFIG),
      }).toStrictEqual({ config: edited, recorded: false })
      expect(init.output).toContain(`● \`${CONFIG}\` kept, because it has changes`)
      expect(doctor.output).toContain(
        "`oxfmt.config.ts` does not meet Adamantite's required shape. The exported config does not apply the Adamantite format preset from `adamantite/format`."
      )
    })
  )

  it.effect("keep a changed config that still uses the preset, without a finding", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(CONFIG, RENDERED.replace("defineConfig(format)", "defineConfig({ ...format })"))

      const { output } = yield* runLifecycle("doctor", files)

      expect(output).not.toContain("oxfmt configuration")
    })
  )

  it.effect("delete the config when the selection no longer runs Oxfmt", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const { written } = readLockfile(files)

      files.write(
        LOCKFILE_PATH,
        makeLockfileFile(makeSelection({ scripts: ["analyze"] }), written)[LOCKFILE_PATH]
      )

      const { output } = yield* runLifecycle("update", files)

      expect(files.exists(CONFIG)).toBe(false)
      expect(output).toContain(`✔ \`${CONFIG}\` deleted, because the setup no longer includes it.`)
    })
  )

  // Oxfmt loads no config when it finds both.
  it.effect("write no config beside a conflicting JSON config, and report it", () =>
    Effect.gen(function* () {
      const conflicting = '{ "semi": true }\n'
      const files = makeProject({ ".oxfmtrc.json": conflicting })

      yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({
        config: files.exists(CONFIG),
        conflicting: files.read(".oxfmtrc.json"),
      }).toStrictEqual({
        config: false,
        conflicting,
      })
      expect(doctor.output).toContain(
        "The project configures oxfmt in `.oxfmtrc.json`, so Adamantite does not write `oxfmt.config.ts`."
      )
    })
  )
})
