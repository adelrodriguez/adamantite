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

const CONFIG = "oxlint.config.ts"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check", "--preset", "vitest"]

const OPTIONS = [
  "  ignorePatterns: core.ignorePatterns,",
  "  options: {",
  "    respectEslintDisableDirectives: true,",
  "    typeAware: true,",
  "    typeCheck: true,",
  "  },",
  "})",
  "",
]

// The imports in the order that Oxfmt sorts them, and `extends` in the order of the presets.
const RENDERED = [
  'import core from "adamantite/lint"',
  'import vitest from "adamantite/lint/vitest"',
  'import custom from "adamantite/rules"',
  'import { defineConfig } from "oxlint"',
  "",
  "export default defineConfig({",
  "  extends: [core, vitest, custom()],",
  ...OPTIONS,
].join("\n")

// The config that Adamantite 0.47.0 wrote, before its imports were in Oxfmt's order.
const OLDER = [
  'import { defineConfig } from "oxlint"',
  'import core from "adamantite/lint"',
  'import vitest from "adamantite/lint/vitest"',
  'import custom from "adamantite/rules"',
  "",
  "export default defineConfig({",
  "  extends: [core, vitest, custom()],",
  ...OPTIONS,
].join("\n")

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

describe("Oxlint setup", () => {
  it.effect("create the config of the selected presets and record its hash", () =>
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

  it.effect.each([
    {
      change: "a preset before core",
      config: RENDERED.replace("[core, vitest, custom()]", "[vitest, core, custom()]"),
      finding:
        "`oxlint.config.ts` applies `adamantite/lint/vitest` before the core preset `adamantite/lint` in `extends`.",
    },
    {
      change: "two presets that report the same defects",
      config: RENDERED.replace(
        'import vitest from "adamantite/lint/vitest"',
        'import jest from "adamantite/lint/jest"\nimport vitest from "adamantite/lint/vitest"'
      ).replace("[core, vitest, custom()]", "[core, jest, vitest, custom()]"),
      finding: "`oxlint.config.ts` extends the `jest` and `vitest` presets",
    },
    {
      change: "a required option turned off",
      config: RENDERED.replace("typeCheck: true", "typeCheck: false"),
      finding: "The required Oxlint options are missing or are not set to true.",
    },
  ])("keep a config with $change, and report it in doctor", ({ config, finding }) =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(CONFIG, config)

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect(files.read(CONFIG)).toBe(config)
      expect(init.output).toContain(`● \`${CONFIG}\` kept, because it has changes`)
      expect(doctor.output).toContain(finding)
    })
  )

  // An earlier version wrote the config, and nobody changed it since (#837).
  it.effect("replace a config whose hash equals the hash that the lockfile recorded", () =>
    Effect.gen(function* () {
      const files = makeProject({
        ...makeLockfileFile(makeSelection({ presets: ["core", "vitest"], scripts: ["check"] }), {
          [CONFIG]: hashContent(OLDER),
        }),
        [CONFIG]: OLDER,
      })

      const { output } = yield* runLifecycle("update", files)

      expect(files.read(CONFIG)).toBe(RENDERED)
      expect(output).toContain(`✔ \`${CONFIG}\` replaced with the current version.`)
    })
  )

  it.effect("delete the config when the selection no longer runs Oxlint", () =>
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

  // Oxlint loads no config when it finds both, so Doctor hands the migration to an agent.
  it.effect("write no config beside a legacy .oxlintrc.json, and report the legacy file", () =>
    Effect.gen(function* () {
      const legacy = '{ "rules": { "semi": "error" } }\n'
      const files = makeProject({ ".oxlintrc.json": legacy })

      yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({ config: files.exists(CONFIG), legacy: files.read(".oxlintrc.json") }).toStrictEqual({
        config: false,
        legacy,
      })
      expect(doctor.output).toContain(
        "The project configures oxlint in the legacy `.oxlintrc.json`, so Adamantite does not write `oxlint.config.ts`."
      )
    })
  )
})
