import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { hashContent, makeLockfileFile, readLockfile } from "./command-test-helpers.ts"
import { listHashes, makeSelection, runLifecycle } from "./lifecycle.ts"

const CONFIG = "knip.config.ts"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const MONOREPO_PACKAGE_JSON =
  '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" }, "workspaces": ["packages/*"] }\n'

const INIT_ARGS = ["--non-interactive", "--script", "analyze"]

const RENDERED =
  'import type { KnipConfig } from "knip"\nimport analyze from "adamantite/analyze"\n\nconst config: KnipConfig = analyze\n\nexport default config\n'

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { "package.json": PACKAGE_JSON, ...files } })
}

describe("Knip setup", () => {
  it.effect("create the config and record its hash", () =>
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

  // The selection decides the ignore lists, so a config for the effect preset is right on the first
  // init, before the Oxlint config imports the preset.
  it.effect("ignore Sherif in a monorepo and the language service with the effect preset", () =>
    Effect.gen(function* () {
      const files = makeProject({ "package.json": MONOREPO_PACKAGE_JSON })

      yield* runLifecycle("init", files, [...INIT_ARGS, "--script", "check", "--preset", "effect"])

      expect(files.read(CONFIG)).toContain(
        "ignoreDependencies: [...ignoreDependencies.monorepo, ...ignoreDependencies.effect],"
      )
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

  it.effect("keep a config that the user changed, and report a missing ignore list", () =>
    Effect.gen(function* () {
      const files = makeProject({ "package.json": MONOREPO_PACKAGE_JSON })
      yield* runLifecycle("init", files, INIT_ARGS)

      // The config of a single package, without the Sherif ignore list that a monorepo needs.
      files.write(CONFIG, RENDERED)

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(CONFIG)).toBe(RENDERED)
      expect(init.output).toContain(`● \`${CONFIG}\` kept, because it has changes`)
      expect(doctor.output).toContain(
        "The file must set `ignoreDependencies: ignoreDependencies.monorepo` from `adamantite/analyze`"
      )
    })
  )

  it.effect("replace a config whose hash equals the hash that the lockfile recorded", () =>
    Effect.gen(function* () {
      const older = RENDERED.replace("analyze\n\nexport", "{ ...analyze }\n\nexport")

      const files = makeProject({
        ...makeLockfileFile(makeSelection({ scripts: ["analyze"] }), {
          [CONFIG]: hashContent(older),
        }),
        [CONFIG]: older,
      })

      const { output } = yield* runLifecycle("update", files)

      expect(files.read(CONFIG)).toBe(RENDERED)
      expect(output).toContain(`✔ \`${CONFIG}\` replaced with the current version.`)
    })
  )

  it.effect("delete the config when the selection no longer runs Knip", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const { written } = readLockfile(files)

      files.write(
        LOCKFILE_PATH,
        makeLockfileFile(makeSelection({ scripts: ["check"] }), written)[LOCKFILE_PATH]
      )

      yield* runLifecycle("update", files)

      expect(files.exists(CONFIG)).toBe(false)
    })
  )

  // Knip loads `knip.json` before `knip.config.ts`, so a config beside it would do nothing.
  it.effect.each<{ readonly files: Record<string, string>; readonly state: string }>([
    { files: {}, state: "The project configures knip in `knip.jsonc`" },
    {
      files: { [CONFIG]: RENDERED },
      state:
        "The project has `knip.jsonc` beside `knip.config.ts`, and Knip loads the JSON config and ignores `knip.config.ts`.",
    },
  ])("keep a conflicting JSON config, and report it in doctor", ({ files: extra, state }) =>
    Effect.gen(function* () {
      const conflicting = '{\n  "entry": ["src/index.ts"],\n}\n'
      const files = makeProject({ ...extra, "knip.jsonc": conflicting })

      yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({
        config: files.exists(CONFIG) ? files.read(CONFIG) : null,
        conflicting: files.read("knip.jsonc"),
      }).toStrictEqual({ config: extra[CONFIG] ?? null, conflicting })
      expect(doctor.output).toContain(state)
    })
  )
})
