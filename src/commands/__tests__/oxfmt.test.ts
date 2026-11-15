import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "./command-test-helpers.ts"
import { listHashes, makeSelection, runLifecycle } from "./lifecycle.ts"

const CONFIG = "oxfmt.config.ts"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check"]

const RENDERED =
  'import format from "adamantite/format"\nimport { defineConfig } from "oxfmt"\n\nexport default defineConfig(format)\n'

// The config that Adamantite 0.47.0 wrote, before its imports were in Oxfmt's order.
const OLDER =
  'import { defineConfig } from "oxfmt"\nimport format from "adamantite/format"\n\nexport default defineConfig(format)\n'

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

describe("Oxfmt setup", () => {
  it.effect("create the config and record its hash", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect({
        config: files.read(CONFIG),
        failure: getFailure(exit),
        recorded: readLockfile(files).written[CONFIG],
      }).toStrictEqual({
        config: RENDERED,
        failure: findingsLeft("init"),
        recorded: hashContent(RENDERED),
      })
      expect(output).toContain(`✔ \`${CONFIG}\` created.`)
    })
  )

  it.effect("report the config unchanged on a second init, and keep the lockfile as it was", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const before = listHashes(files)

      const { output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(listHashes(files)).toStrictEqual(before)
      expect(output).toContain(`● \`${CONFIG}\` is up to date.`)
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
        "`oxfmt.config.ts` does not meet Adamantite's required shape. The file must import the Adamantite format preset from `adamantite/format`."
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

  // An earlier version wrote the config, and nobody changed it since (#837).
  it.effect("replace a config whose hash equals the hash that the lockfile recorded", () =>
    Effect.gen(function* () {
      const files = makeProject({
        ...makeLockfileFile(makeSelection({ presets: ["core"], scripts: ["check"] }), {
          [CONFIG]: hashContent(OLDER),
        }),
        [CONFIG]: OLDER,
      })

      const { exit, output } = yield* runLifecycle("update", files)

      expect({
        config: files.read(CONFIG),
        failure: getFailure(exit),
        recorded: readLockfile(files).written[CONFIG],
      }).toStrictEqual({
        config: RENDERED,
        failure: findingsLeft("update"),
        recorded: hashContent(RENDERED),
      })
      expect(output).toContain(`✔ \`${CONFIG}\` replaced with the current version.`)
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

  // Oxfmt loads no config when it finds both, so Doctor hands the migration to an agent.
  it.effect("write no config beside a legacy JSON config, and report the legacy file", () =>
    Effect.gen(function* () {
      const legacy = '{ "semi": true }\n'
      const files = makeProject({ ".oxfmtrc.json": legacy })

      yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({ config: files.exists(CONFIG), legacy: files.read(".oxfmtrc.json") }).toStrictEqual({
        config: false,
        legacy,
      })
      expect(doctor.output).toContain(
        "The project configures oxfmt in the legacy `.oxfmtrc.json`, so Adamantite does not write `oxfmt.config.ts`."
      )
    })
  )
})
