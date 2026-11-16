import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import type { FileSystemTestContext } from "#__tests__/filesystem.ts"
import type { Selection } from "#lib/project/selection.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import doctorCommand from "#commands/doctor.ts"
import initCommand from "#commands/init/index.ts"
import updateCommand from "#commands/update.ts"
import {
  EFFECT_COMPILER,
  EFFECT_EDITOR_PACKAGES,
  EFFECT_SDK,
  effectEditorFiles,
  effectEditorResolver,
} from "#lib/integrations/__tests__/effect-sdk-fixture.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { formatJson } from "#lib/shared/json.ts"
import {
  createDependencyInstallerTestContext,
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
  runCommand,
} from "./command-test-helpers.ts"

const SETTINGS = ".vscode/settings.json"
const EXTENSIONS = ".vscode/extensions.json"

// The project depends on Adamantite already, so init installs only the tools, and Doctor assesses.
const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

// The scripts that need the Oxc and Knip extensions, and VS Code.
const INIT_ARGS = [
  "--non-interactive",
  "--script",
  "check",
  "--script",
  "analyze",
  "--editor",
  "vscode",
]

// The tests install no Oxfmt, so Setup writes each file as rendered. `formatted.test.ts` covers the
// layout that the project's Oxfmt gives it.
const RECOMMENDATIONS = `${Effect.runSync(formatJson({ recommendations: ["oxc.oxc-vscode", "webpro.vscode-knip"] }))}\n`

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { ...files, "package.json": PACKAGE_JSON } })
}

type RunOptions = Parameters<typeof runCommand>[2]

// One exit type for the three commands, so a test reads each exit the same way.
const widen = Effect.map((exit: Exit.Exit<unknown, unknown>) => exit)

const COMMANDS = {
  doctor: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(doctorCommand, args, options)),
  init: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(initCommand, args, options)),
  update: (args: readonly string[], options: RunOptions) =>
    widen(runCommand(updateCommand, args, options)),
}

/**
 * Runs a command in `files` and returns its exit and its output lines. `installed` resolves the
 * Effect packages of `effectEditorFiles()`.
 */
function run(
  command: keyof typeof COMMANDS,
  files: FileSystemTestContext,
  args: readonly string[] = [],
  installed = false
) {
  return Effect.gen(function* () {
    const logLines: unknown[] = []

    const exit = yield* COMMANDS[command](args, {
      files,
      layers: [
        createDependencyInstallerTestContext().layer,
        effectEditorResolver(files.root, installed),
      ],
      logLines,
    })

    return { exit, output: logLines.join("\n") }
  })
}

function listHashes(files: FileSystemTestContext) {
  return Object.fromEntries(files.list().map((file) => [file, hashContent(files.read(file))]))
}

describe("VS Code setup", () => {
  it.effect("create the settings and the extension recommendations, and record their hashes", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* run("init", files, INIT_ARGS)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(EXTENSIONS)).toBe(RECOMMENDATIONS)
      expect(files.read(SETTINGS)).toContain(
        '"oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js"'
      )
      expect(readLockfile(files).written).toMatchObject({
        [EXTENSIONS]: hashContent(files.read(EXTENSIONS)),
        [SETTINGS]: hashContent(files.read(SETTINGS)),
      })
      expect(output).toContain(`✔ \`${SETTINGS}\` created.\n✔ \`${EXTENSIONS}\` created.`)
    })
  )

  it.effect("report the files unchanged on a second init, and keep the lockfile as it was", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* run("init", files, INIT_ARGS)
      const before = listHashes(files)
      const lockfile = files.read(LOCKFILE_PATH)

      const { exit, output } = yield* run("init", files, INIT_ARGS)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(LOCKFILE_PATH)).toBe(lockfile)
      expect(listHashes(files)).toStrictEqual(before)
      expect(output).toContain(
        [
          `● \`${SETTINGS}\` is up to date.`,
          `● \`${EXTENSIONS}\` is up to date.`,
          `● \`${LOCKFILE_PATH}\` already records this setup.`,
        ].join("\n")
      )
    })
  )

  it.effect("keep an edited extensions file, and report the missing recommendation in doctor", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* run("init", files, INIT_ARGS)

      const edited =
        '{\n  // The team installs Knip on its own.\n  "recommendations": ["oxc.oxc-vscode"],\n}\n'

      files.write(EXTENSIONS, edited)

      const init = yield* run("init", files, INIT_ARGS)

      expect({
        content: files.read(EXTENSIONS),
        failure: getFailure(init.exit),
        recorded: Object.hasOwn(readLockfile(files).written, EXTENSIONS),
      }).toStrictEqual({ content: edited, failure: findingsLeft("init"), recorded: false })
      expect(init.output).toContain(
        `● \`${EXTENSIONS}\` kept, because it has changes that Adamantite did not write.`
      )

      const doctor = yield* run("doctor", files)

      expect(Exit.isFailure(doctor.exit)).toBe(true)
      expect(doctor.output).toContain(
        [
          "VS Code does not recommend the extensions of the setup",
          "",
          `- **Current state:** \`${EXTENSIONS}\` does not recommend \`webpro.vscode-knip\`.`,
        ].join("\n")
      )
    })
  )

  it.effect("keep settings that the user wrote, and report a broken Oxlint entry in doctor", () =>
    Effect.gen(function* () {
      const settings = '{\n  // Team setting\n  "editor.tabSize": 4,\n}\n'
      const files = makeProject({ [SETTINGS]: settings })

      const init = yield* run("init", files, INIT_ARGS)

      expect(getFailure(init.exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(SETTINGS)).toBe(settings)
      expect(init.output).not.toContain("comments or trailing commas")

      const doctor = yield* run("doctor", files)

      expect(doctor.output).toContain("VS Code does not use the Oxlint entry")
      expect(doctor.output).toContain(`\`${SETTINGS}\` sets \`oxc.path.oxlint\` to no value.`)
    })
  )

  it.effect.each([
    { content: "[]", error: "InvalidConfigFormat", file: SETTINGS },
    { content: "{", error: "FailedToParseFile", file: SETTINGS },
    {
      content: '{ "recommendations": "oxc.oxc-vscode" }',
      error: "InvalidConfigFormat",
      file: EXTENSIONS,
    },
  ])("fail doctor when $file holds $content", ({ content, error, file }) =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* run("init", files, INIT_ARGS)
      files.write(file, content)

      const { exit } = yield* run("doctor", files)

      expect(Option.getOrThrow(Exit.findErrorOption(exit))).toMatchObject({ _tag: error })
    })
  )

  // An earlier version wrote this file, and nobody changed it since (#837).
  it.effect("replace a file whose hash equals the hash that the lockfile recorded", () =>
    Effect.gen(function* () {
      const older = '{\n  "recommendations": ["oxc.oxc-vscode"]\n}\n'

      const selection = {
        agents: false,
        ci: null,
        editors: ["vscode"],
        presets: [],
        scripts: ["analyze"],
        typescript: null,
      } as const satisfies Selection

      const files = makeProject({
        ...makeLockfileFile(selection, { [EXTENSIONS]: hashContent(older) }),
        [EXTENSIONS]: older,
      })

      const { exit, output } = yield* run("update", files)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(files.read(EXTENSIONS)).toBe(
        `${yield* formatJson({ recommendations: ["webpro.vscode-knip"] })}\n`
      )
      expect(readLockfile(files).written[EXTENSIONS]).toBe(hashContent(files.read(EXTENSIONS)))
      expect(output).toContain(`✔ \`${EXTENSIONS}\` replaced with the current version.`)
    })
  )

  it.effect(
    "delete a file that the selection dropped while its hash still matches, and keep a changed one",
    () =>
      Effect.gen(function* () {
        const files = makeProject()
        yield* run("init", files, INIT_ARGS)
        files.write(EXTENSIONS, '{ "recommendations": [] }\n')

        // The selection no longer names VS Code.
        const { selection, written } = readLockfile(files)

        files.write(
          LOCKFILE_PATH,
          makeLockfileFile({ ...selection, editors: [] }, written)[LOCKFILE_PATH]
        )

        const { exit, output } = yield* run("update", files)

        expect({
          extensions: files.read(EXTENSIONS),
          failure: getFailure(exit),
          recorded: Object.keys(readLockfile(files).written).filter((file) =>
            file.startsWith(".vscode/")
          ),
          settings: files.exists(SETTINGS),
        }).toStrictEqual({
          extensions: '{ "recommendations": [] }\n',
          failure: findingsLeft("update"),
          recorded: [],
          settings: false,
        })
        expect(output).toContain(
          `✔ \`${SETTINGS}\` deleted, because the setup no longer includes it.`
        )
      })
  )
})

describe("the Effect editor SDK", () => {
  it.effect("prepare the SDK in node_modules and select it without changing packages", () =>
    Effect.gen(function* () {
      const installed = effectEditorFiles()
      const files = makeProject(installed)
      files.makeReadOnly("node_modules/@effect")
      files.makeReadOnly("node_modules/typescript")

      const { exit } = yield* run("init", files, INIT_ARGS, true)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(SETTINGS)).toMatch(
        /"js\/ts\.tsdk\.path": "node_modules\/\.cache\/adamantite\/effect"[\s\S]*"effecttsgo\/global-json-in-effect": \{/u
      )
      expect({
        compiler: files.read(`${EFFECT_SDK}/${EFFECT_COMPILER.split("/").at(-1)}`),
        library: files.read(`${EFFECT_SDK}/lib.es5.d.ts`),
      }).toStrictEqual({ compiler: "native compiler", library: "interface String {}" })

      const packages = Object.keys(installed).filter((path) => path.startsWith("node_modules/"))

      expect(Object.fromEntries(packages.map((path) => [path, files.read(path)]))).toStrictEqual(
        Object.fromEntries(packages.map((path) => [path, installed[path]]))
      )

      const doctor = yield* run("doctor", files, [], true)

      expect(doctor.output).not.toMatch(/VS Code|Effect editor SDK/u)
    })
  )

  it.effect("copy the versioned compiler that matches the installed TypeScript commit", () =>
    Effect.gen(function* () {
      const files = makeProject(effectEditorFiles())
      const source = EFFECT_COMPILER.replace("/lib/", "/artifacts/typescript/7.0.2/")

      files.write(
        EFFECT_COMPILER.replace(/tsc(?:\.exe)?$/u, "upstream.json"),
        yield* formatJson({
          components: {
            typescript: {
              "7.0.2": { gitHead: "typescript-commit" },
              "7.1.0-beta": { gitHead: "newer-commit" },
            },
          },
          schemaVersion: 5,
          tags: { typescript: { latest: "7.1.0-beta" } },
        })
      )
      files.write(source, "versioned compiler")
      files.write(source.replace(/tsc(?:\.exe)?$/u, "lib.d.ts"), "versioned standard library")

      yield* run("init", files, INIT_ARGS, true)

      expect(files.read(`${EFFECT_SDK}/${source.split("/").at(-1)}`)).toBe("versioned compiler")
      expect(files.read(`${EFFECT_SDK}/lib.d.ts`)).toBe("versioned standard library")
    })
  )

  it.effect("report a stale SDK in doctor, and refresh it in update", () =>
    Effect.gen(function* () {
      const files = makeProject(effectEditorFiles())
      yield* run("init", files, INIT_ARGS, true)
      files.write("node_modules/@effect/tsgo/package.json", '{ "version": "0.67.4" }')
      files.write(EFFECT_COMPILER, "updated compiler")

      const before = yield* run("doctor", files, [], true)

      expect(before.output).toContain("The Effect editor SDK needs preparation")
      expect(before.output).toContain("does not match the installed Effect compiler")

      const update = yield* run("update", files, [], true)

      expect(getFailure(update.exit)).toStrictEqual(findingsLeft("update"))
      expect(files.read(`${EFFECT_SDK}/${EFFECT_COMPILER.split("/").at(-1)}`)).toBe(
        "updated compiler"
      )

      const after = yield* run("doctor", files, [], true)

      expect(after.output).not.toContain("The Effect editor SDK needs preparation")
    })
  )

  it.effect.each([
    {
      name: "TypeScript has no matching Effect build",
      reason: "no editor compiler matching TypeScript",
      typescript: '{ "gitHead": "unsupported", "version": "7.0.2" }',
    },
    {
      name: "only TypeScript 6 is installed",
      reason: "needs an installed native TypeScript package with its gitHead",
      typescript: '{ "version": "6.0.3" }',
    },
    {
      name: "TypeScript 7 has no gitHead",
      reason: "needs an installed native TypeScript package with its gitHead",
      typescript: '{ "version": "7.0.2" }',
    },
  ])("set up without the SDK, and report it in doctor, when $name", ({ reason, typescript }) =>
    Effect.gen(function* () {
      const files = makeProject({
        ...effectEditorFiles(),
        "node_modules/typescript/package.json": typescript,
      })

      const init = yield* run("init", files, INIT_ARGS, true)

      expect(getFailure(init.exit)).toStrictEqual(findingsLeft("init"))
      expect(files.exists(EFFECT_SDK)).toBe(false)

      const doctor = yield* run("doctor", files, [], true)

      expect(doctor.output).toContain("The Effect editor SDK needs preparation")
      expect(doctor.output).toContain(reason)
    })
  )

  it.effect("use a prerelease of TypeScript 7", () =>
    Effect.gen(function* () {
      const files = makeProject({
        ...effectEditorFiles(),
        "node_modules/typescript/package.json":
          '{ "gitHead": "typescript-commit", "version": "7.0.0-dev.20250101.1" }',
      })

      yield* run("init", files, INIT_ARGS, true)

      expect(files.read(`${EFFECT_SDK}/lib.es5.d.ts`)).toBe("interface String {}")
    })
  )

  it.effect("use @typescript/native when the typescript package is older than 7", () =>
    Effect.gen(function* () {
      const files = makeProject({
        ...effectEditorFiles(),
        "node_modules/@typescript/native/package.json":
          '{ "gitHead": "typescript-commit", "version": "7.0.2" }',
        "node_modules/typescript/package.json": '{ "version": "6.0.3" }',
      })

      const exit = yield* runCommand(initCommand, INIT_ARGS, {
        files,
        layers: [
          createDependencyInstallerTestContext().layer,
          makeModuleResolverLayer(files.root, {
            ...EFFECT_EDITOR_PACKAGES,
            "@typescript/native/package.json": "node_modules/@typescript/native/package.json",
          }),
        ],
      })

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(files.read(`${EFFECT_SDK}/lib.es5.d.ts`)).toBe("interface String {}")
    })
  )
})
