import type { PackageJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import type { Selection, TypeScriptPreset } from "#lib/project/selection.ts"
import {
  findingsLeft,
  getFailure,
  hashContent,
  makeLockfileFile,
  readLockfile,
} from "#__tests__/command-test-helpers.ts"
import { withConfigLoader } from "#__tests__/config-loader.ts"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeSelection, runLifecycle } from "#__tests__/lifecycle.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import { Report } from "#commands/doctor.ts"
import typescript from "#lib/integrations/typescript/index.ts"
import { readProject } from "#lib/project/index.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

const PACKAGE = { name: "project" }

const EMPTY_SELECTION = {
  agents: false,
  ci: null,
  editors: [],
  presets: [],
  scripts: [],
  typescript: null,
} as const satisfies Selection

const RESETS = "node_modules/adamantite/dist/presets/typescript/resets/index.d.ts"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

/**
 * What `tsc --showConfig` reports for the package in each directory below `ROOT`: whether its
 * resolved `files` include the type resets, or that the command fails.
 */
type ShowConfig = Readonly<Record<string, "fails" | "plain" | "resets">>

function makeShowConfigLayer(showConfig: ShowConfig) {
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make((command) => {
      const directory = ChildProcess.isStandardCommand(command) ? (command.options.cwd ?? "") : ""
      const result = showConfig[directory.slice(ROOT.length + 1)] ?? "plain"

      const files =
        result === "resets"
          ? [`${"../".repeat(directory.split("/").length - 2)}${RESETS}`, "./index.ts"]
          : ["./index.ts"]

      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result === "fails" ? 1 : 0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(JSON.stringify({ files }))),
          unref: Effect.succeed(Effect.void),
        })
      )
    })
  )
}

// TypeScript is installed at the root, so every package resolves it.
const TYPESCRIPT_FILES = {
  "node_modules/typescript/package.json": JSON.stringify({ bin: { tsc: "./bin/tsc" } }),
}

const TYPESCRIPT_RESOLUTIONS = {
  "typescript/package.json": "node_modules/typescript/package.json",
}

const decodeReport = Schema.decodeUnknownSync(Schema.fromJsonString(Report))

/**
 * What Doctor reports for a project whose lockfile selects `preset` and no script, so that only the
 * TypeScript integration applies. The root `package.json` declares Adamantite and `manifest`.
 */
function assess(
  preset: TypeScriptPreset,
  manifest: PackageJson,
  files: Record<string, string> = {},
  showConfig: ShowConfig = {}
) {
  return Effect.gen(function* () {
    const project = makeFiles({
      ...TYPESCRIPT_FILES,
      ...makeLockfileFile(makeSelection({ typescript: preset })),
      "package.json": yield* stringifyJson({
        devDependencies: { adamantite: "1.0.0" },
        ...manifest,
      }),
      ...files,
    })

    const { output } = yield* runLifecycle(
      "doctor",
      project,
      ["--json"],
      [makeModuleResolverLayer(ROOT, TYPESCRIPT_RESOLUTIONS), makeShowConfigLayer(showConfig)]
    )

    const { applicableIntegrations, findings } = decodeReport(output)

    return { applicableIntegrations, findings }
  })
}

const CONFIG = "tsconfig.json"

const PACKAGE_JSON = '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" } }\n'

const MONOREPO_PACKAGE_JSON =
  '{ "name": "test-project", "devDependencies": { "adamantite": "1.0.0" }, "workspaces": ["packages/*"] }\n'

const INIT_ARGS = ["--non-interactive", "--typescript", "typescript"]

// The tests install no Oxfmt, so Setup writes each file as rendered.
const RENDERED = `${Effect.runSync(formatJson({ extends: "adamantite/typescript" }))}\n`

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

  // Doctor follows no base config of another package, so it cannot tell which preset the package
  // uses, and reports neither a missing nor a mismatched preset.
  it.effect.each([
    { preset: "tsconfig", specifier: "@company/config" },
    { preset: "typescript", specifier: "@company/config" },
    { preset: "tsconfig", specifier: "@company/config/base" },
    { preset: "typescript", specifier: "@company/config/base" },
  ] as const)(
    "check no preset through the package base $specifier when the lockfile selects $preset",
    ({ preset, specifier }) =>
      Effect.gen(function* () {
        const files = makeProject({
          ...makeLockfileFile(makeSelection({ typescript: preset })),
          [CONFIG]: `{ "extends": "${specifier}", "include": ["src"] }\n`,
          "node_modules/@company/config/base.json": '{ "extends": "adamantite/tsconfig" }\n',
          "node_modules/@company/config/package.json": '{ "name": "@company/config" }\n',
          "node_modules/@company/config/tsconfig.json": '{ "extends": "adamantite/tsconfig" }\n',
        })

        const doctor = yield* runLifecycle("doctor", files, ["--json"])

        expect(decodeReport(doctor.output).findings).toStrictEqual([])
      })
  )

  // TypeScript adds `.json` to a relative entry that names no file, and a folder is not a file.
  it.effect("find adamantite/tsconfig through ./base.json beside a base folder", () =>
    Effect.gen(function* () {
      const files = makeProject({
        ...makeLockfileFile(makeSelection({ typescript: "tsconfig" })),
        [CONFIG]: '{ "extends": "./base", "include": ["src"] }\n',
        "base.json": '{ "extends": "adamantite/tsconfig" }\n',
        "base/index.ts": "export {}\n",
      })

      const doctor = yield* runLifecycle("doctor", files)
      const json = yield* runLifecycle("doctor", files, ["--json"])

      expect({
        findings: decodeReport(json.output).findings.map(({ title }) => title),
        succeeded: Exit.isSuccess(doctor.exit),
      }).toStrictEqual({ findings: [], succeeded: true })
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

describe("tsconfig", () => {
  describe("assess", () => {
    it.effect("read a tsconfig.json with comments and a trailing comma", () =>
      Effect.gen(function* () {
        const result = yield* assess(
          "typescript",
          PACKAGE,
          {
            "tsconfig.json":
              '{\n  // Visit https://aka.ms/tsconfig\n  "extends": "adamantite/typescript",\n}\n',
          },
          { "": "resets" }
        )

        expect(result).toStrictEqual({ applicableIntegrations: ["tsconfig"], findings: [] })
      })
    )

    // Only `adamantite/typescript` loads the type resets.
    it.effect.each<{
      readonly extendsEntry: string | readonly string[]
      readonly preset: TypeScriptPreset
      readonly showConfig: ShowConfig
    }>([
      { extendsEntry: "adamantite/typescript", preset: "typescript", showConfig: { "": "resets" } },
      {
        extendsEntry: ["./base.json", "adamantite/typescript"],
        preset: "typescript",
        showConfig: { "": "resets" },
      },
      { extendsEntry: "adamantite/tsconfig", preset: "tsconfig", showConfig: {} },
      { extendsEntry: ["./base.json", "adamantite/tsconfig"], preset: "tsconfig", showConfig: {} },
    ])(
      "accept the selected $preset preset in extends: $extendsEntry",
      ({ extendsEntry, preset, showConfig }) =>
        Effect.gen(function* () {
          const result = yield* assess(
            preset,
            PACKAGE,
            { "tsconfig.json": yield* stringifyJson({ extends: extendsEntry }) },
            showConfig
          )

          expect(result).toStrictEqual({ applicableIntegrations: ["tsconfig"], findings: [] })
        })
    )

    it.effect.each<{
      readonly expected: ReadonlyArray<{ readonly id: string }>
      readonly manifest: PackageJson
      readonly name: string
    }>([
      {
        expected: [{ id: "typescript-preset-in-library" }],
        manifest: { exports: "./dist/index.js", name: "library" },
        name: "report a library with exports",
      },
      {
        expected: [{ id: "typescript-preset-in-library" }],
        manifest: { name: "library", types: "./dist/index.d.ts" },
        name: "report a library with types",
      },
      {
        expected: [],
        manifest: { exports: "./dist/index.js", name: "app", private: true },
        name: "accept a private package",
      },
      {
        expected: [],
        manifest: { name: "app" },
        name: "accept a package without exports or types",
      },
    ])("$name whose TypeScript config loads the type resets", ({ expected, manifest }) =>
      Effect.gen(function* () {
        const result = yield* assess(
          "typescript",
          manifest,
          { "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }) },
          { "": "resets" }
        )

        expect(result).toMatchObject({ applicableIntegrations: ["tsconfig"], findings: expected })
      })
    )

    it.effect("report workspace libraries that load the type resets through a shared base", () =>
      Effect.gen(function* () {
        const library = { exports: "./dist/index.js" }

        const result = yield* assess(
          "typescript",
          { name: "root", private: true },
          {
            "packages/app/package.json": yield* stringifyJson({ name: "app", private: true }),
            "packages/app/tsconfig.json": yield* stringifyJson({ extends: "../../base.json" }),
            "packages/library/package.json": yield* stringifyJson({ ...library, name: "library" }),
            "packages/library/tsconfig.json": yield* stringifyJson({ extends: "../../base.json" }),
            "packages/plain/package.json": yield* stringifyJson({ ...library, name: "plain" }),
            "packages/plain/tsconfig.json": yield* stringifyJson({
              extends: "adamantite/tsconfig",
            }),
            "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
          },
          { "packages/app": "resets", "packages/library": "resets" }
        )

        expect(result).toMatchObject({
          applicableIntegrations: ["tsconfig"],
          findings: [
            {
              currentState: expect.stringContaining("`packages/library/tsconfig.json`"),
              id: "typescript-preset-in-library",
            },
          ],
        })
      })
    )

    it.effect.each<{ readonly name: string; readonly showConfig: ShowConfig }>([
      { name: "its config sets files, so TypeScript loads no resets", showConfig: {} },
      { name: "tsc --showConfig fails", showConfig: { "": "fails" } },
    ])("report no library finding when $name", ({ showConfig }) =>
      Effect.gen(function* () {
        const result = yield* assess(
          "typescript",
          { name: "library", types: "./dist/index.d.ts" },
          {
            "tsconfig.json": yield* stringifyJson({
              extends: "adamantite/typescript",
              files: ["index.ts"],
            }),
          },
          showConfig
        )

        expect(result).toStrictEqual({ applicableIntegrations: ["tsconfig"], findings: [] })
      })
    )

    it.effect("skip the library check when TypeScript is not installed", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({ name: "library", types: "./dist/index.d.ts" }),
          "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) =>
            typescript.assess(project, { ...EMPTY_SELECTION, typescript: "typescript" })
          ),
          Effect.provide(
            withConfigLoader(
              Layer.mergeAll(
                files.layer,
                Path.layer,
                makeModuleResolverLayer(ROOT),
                makeShowConfigLayer({ "": "resets" })
              )
            )
          )
        )

        expect(result).toMatchObject({ findings: [] })
      })
    )
  })
})
