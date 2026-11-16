import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "#__tests__/command-test-helpers.ts"
import { effectEditorFiles, effectEditorResolver } from "#__tests__/effect-sdk.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { runLifecycle } from "#__tests__/lifecycle.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"

const SETTINGS = ".zed/settings.json"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const INIT_ARGS = ["--non-interactive", "--script", "check", "--editor", "zed"]

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

describe("Zed setup", () => {
  it.effect("create the settings, record their hash, and link the extensions", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(SETTINGS)).toContain('"node_modules/adamantite/dist/oxlint.js"')
      expect(readLockfile(files).written[SETTINGS]).toBe(hashContent(files.read(SETTINGS)))
      expect(output).toContain(`✔ \`${SETTINGS}\` created.`)
      // Zed reads `auto_install_extensions` only from the user settings.
      expect(output).toContain("Install the Zed `oxc` extension: zed://extension/oxc")
    })
  )

  it.effect("select the installed Effect language server", () =>
    Effect.gen(function* () {
      const files = makeProject(effectEditorFiles())

      yield* runLifecycle(
        "init",
        files,
        [...INIT_ARGS, "--preset", "effect"],
        [effectEditorResolver(files.root, true)]
      )

      const doctor = yield* runLifecycle(
        "doctor",
        files,
        [],
        [effectEditorResolver(files.root, true)]
      )

      expect(files.read(SETTINGS)).toContain('"node_modules/@effect/tsgo/dist/effect-tsgo.cjs"')
      expect(doctor.output).not.toContain("Zed does not use the Effect language server")
    })
  )

  // Init never merges its settings into settings with comments, or stops on them.
  it.effect("keep settings that the user wrote, and report a broken Oxlint entry in doctor", () =>
    Effect.gen(function* () {
      const own = '{\n  // Team setting\n  "tab_size": 4,\n}\n'
      const files = makeProject({ [SETTINGS]: own })

      const init = yield* runLifecycle("init", files, INIT_ARGS)
      const doctor = yield* runLifecycle("doctor", files)

      expect({
        failure: getFailure(init.exit),
        settings: files.read(SETTINGS),
      }).toStrictEqual({ failure: findingsLeft("init"), settings: own })
      expect(init.output).toContain(`● \`${SETTINGS}\` kept, because it has changes`)
      expect(doctor.output).toContain(`\`${SETTINGS}\` sets \`lsp.oxlint.binary\` to no value.`)
    })
  )

  it.effect("report kept settings without the Effect language server in doctor", () =>
    Effect.gen(function* () {
      const files = makeProject(effectEditorFiles())
      const layers = [effectEditorResolver(files.root, true)]

      yield* runLifecycle("init", files, [...INIT_ARGS, "--preset", "effect"], layers)
      files.write(SETTINGS, files.read(SETTINGS).replaceAll('"typescript-ls",', ""))

      const doctor = yield* runLifecycle("doctor", files, [], layers)

      expect(doctor.output).toContain("Zed does not use the Effect language server")
    })
  )

  it.effect.each([
    { content: "[]", error: "InvalidConfigFormat" },
    { content: "{", error: "FailedToParseFile" },
  ])("fail doctor when the settings hold $content", ({ content, error }) =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      files.write(SETTINGS, content)

      const { exit } = yield* runLifecycle("doctor", files)

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({ _tag: error })
    })
  )

  it.effect("delete the settings when the selection no longer names Zed", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const { selection, written } = readLockfile(files)

      files.write(
        LOCKFILE_PATH,
        makeLockfileFile({ ...selection, editors: [] }, written)[LOCKFILE_PATH]
      )

      yield* runLifecycle("update", files)

      expect(files.exists(SETTINGS)).toBe(false)
    })
  )
})
