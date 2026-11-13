import type { TsConfigJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { InvalidConfigFormat, JsoncNotEditable } from "#lib/shared/errors.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

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

function provideFiles(files: FileSystemTestContext, showConfig: ShowConfig = {}) {
  return Effect.provide([
    files.layer,
    Path.layer,
    makeModuleResolverLayer(ROOT, TYPESCRIPT_RESOLUTIONS),
    makeShowConfigLayer(showConfig),
  ])
}

function assess(files: Record<string, string>, showConfig: ShowConfig = {}) {
  return readProject(ROOT).pipe(
    Effect.flatMap((project) => tsconfig.assess(project)),
    provideFiles(makeFiles({ ...TYPESCRIPT_FILES, ...files }), showConfig)
  )
}

describe("tsconfig", () => {
  describe("assess", () => {
    const packageJson = { name: "project" }

    it.effect.each<{ readonly configFiles: Record<string, string>; readonly name: string }>([
      { configFiles: {}, name: "no tsconfig.json" },
      {
        configFiles: { "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }) },
        name: "no extends",
      },
      {
        configFiles: { "tsconfig.json": JSON.stringify({ extends: "@company/tsconfig" }) },
        name: "another base config",
      },
    ])("skip a project with $name, whatever its scripts", ({ configFiles }) =>
      Effect.gen(function* () {
        for (const scripts of [undefined, { check: "adamantite check" }]) {
          const result = yield* assess({
            "package.json": yield* stringifyJson({ ...packageJson, scripts }),
            ...configFiles,
          })

          expect(result).toStrictEqual({ applicable: false })
        }
      })
    )

    it.effect("read a tsconfig.json with comments and a trailing comma", () =>
      Effect.gen(function* () {
        const result = yield* assess(
          {
            "package.json": yield* stringifyJson(packageJson),
            "tsconfig.json":
              '{\n  // Visit https://aka.ms/tsconfig\n  "extends": "adamantite/typescript",\n}\n',
          },
          { "": "resets" }
        )

        expect(result).toStrictEqual({
          applicable: true,
          findings: [],
          packageActions: [],
          warnings: [],
        })
      })
    )

    it.effect("accept either preset as a string or in an array, without any script", () =>
      Effect.gen(function* () {
        for (const preset of [
          "adamantite/typescript",
          ["./base.json", "adamantite/typescript"],
          "adamantite/tsconfig",
          ["./base.json", "adamantite/tsconfig"],
        ]) {
          const result = yield* assess(
            {
              "package.json": yield* stringifyJson(packageJson),
              "tsconfig.json": yield* stringifyJson({ extends: preset }),
            },
            { "": "resets" }
          )

          expect(result).toStrictEqual({
            applicable: true,
            findings: [],
            packageActions: [],
            warnings: [],
          })
        }
      })
    )

    it.effect.each([
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
          {
            "package.json": yield* stringifyJson(manifest),
            "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
          },
          { "": "resets" }
        )

        expect(result).toMatchObject({ applicable: true, findings: expected })
      })
    )

    it.effect("report workspace libraries that load the type resets through a shared base", () =>
      Effect.gen(function* () {
        const library = { exports: "./dist/index.js" }

        const result = yield* assess(
          {
            "package.json": yield* stringifyJson({ name: "root", private: true }),
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
          applicable: true,
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
          {
            "package.json": yield* stringifyJson({ name: "library", types: "./dist/index.d.ts" }),
            "tsconfig.json": yield* stringifyJson({
              extends: "adamantite/typescript",
              files: ["index.ts"],
            }),
          },
          showConfig
        )

        expect(result).toMatchObject({ applicable: true, findings: [] })
      })
    )

    it.effect("skip the library check when TypeScript is not installed", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({ name: "library", types: "./dist/index.d.ts" }),
          "tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => tsconfig.assess(project)),
          Effect.provide([
            files.layer,
            Path.layer,
            makeModuleResolverLayer(ROOT),
            makeShowConfigLayer({ "": "resets" }),
          ])
        )

        expect(result).toMatchObject({ applicable: true, findings: [] })
      })
    )
  })

  describe("create", () => {
    it.effect.each(["typescript", "tsconfig"] as const)(
      "create a config for the %s preset that assess accepts",
      (preset) =>
        Effect.gen(function* () {
          const files = makeFiles({ "package.json": yield* stringifyJson({ name: "project" }) })

          yield* tsconfig.create(ROOT, preset).pipe(provideFiles(files))

          expect(readTsConfig(files)).toStrictEqual({ extends: `adamantite/${preset}` })

          expect(
            yield* readProject(ROOT).pipe(
              Effect.flatMap((project) => tsconfig.assess(project)),
              provideFiles(files)
            )
          ).toStrictEqual({
            applicable: true,
            findings: [],
            packageActions: [],
            warnings: [],
          })
        })
    )
  })

  describe("update", () => {
    it.effect.each([
      {
        expected: ["@company/tsconfig", "adamantite/typescript"],
        input: "@company/tsconfig",
        name: "append the preset to an existing extends string",
      },
      {
        expected: "adamantite/typescript",
        input: "adamantite/typescript",
        name: "keep extends as a string when it is already the preset",
      },
      {
        expected: ["@company/tsconfig", "@company/tsconfig-strict", "adamantite/typescript"],
        input: ["@company/tsconfig", "@company/tsconfig-strict"],
        name: "append the preset to an existing extends array",
      },
      {
        expected: ["adamantite/typescript", "@company/tsconfig"],
        input: ["adamantite/typescript", "@company/tsconfig"],
        name: "leave an extends array unchanged when it already contains the preset",
      },
      {
        expected: "adamantite/typescript",
        input: "adamantite/tsconfig",
        name: "replace the other Adamantite preset in an extends string",
      },
      {
        expected: ["@company/tsconfig", "adamantite/typescript"],
        input: ["adamantite/tsconfig", "@company/tsconfig"],
        name: "replace the other Adamantite preset in an extends array",
      },
    ])("$name", ({ expected, input }) =>
      Effect.gen(function* () {
        const files = makeFiles({ "tsconfig.json": yield* formatJson({ extends: input }) })

        yield* tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))

        expect(readTsConfig(files).extends).toStrictEqual(expected)
      })
    )

    it.effect("leave a config with comments unchanged and fail with JsoncNotEditable", () =>
      Effect.gen(function* () {
        const content = `{
  // Shared base
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist", // build output
  },
}
`

        const files = makeFiles({ "tsconfig.json": content })

        const result = yield* Effect.result(
          tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))
        )

        expect(Result.isFailure(result)).toBe(true)

        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(JsoncNotEditable)
        }

        expect(files.read("tsconfig.json")).toBe(content)
      })
    )

    it.effect("return InvalidConfigFormat when tsconfig.json is not a JSON object", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "tsconfig.json": "true" })

        const result = yield* Effect.result(
          tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))
        )

        expect(Result.isFailure(result)).toBe(true)

        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(InvalidConfigFormat)
        }
      })
    )
  })
})

function readTsConfig(files: FileSystemTestContext): TsConfigJson {
  // SAFETY: the test seeds tsconfig.json with standard tsconfig fields, and update writes JSON of
  // the same shape back.
  return JSON.parse(files.read("tsconfig.json")) as TsConfigJson
}

function readExtends(files: FileSystemTestContext): string[] {
  const extendsValue = readTsConfig(files).extends ?? []

  return Array.isArray(extendsValue) ? extendsValue : [extendsValue]
}

describe("tsconfig update properties", () => {
  const PRESET = "adamantite/typescript"
  const OTHER_PRESET = "adamantite/tsconfig"

  const userExtends = Schema.Union([
    Schema.Null,
    Schema.Literals([PRESET, OTHER_PRESET, "@tsconfig/node22/tsconfig.json", "./base.json"]),
    Schema.mutable(
      Schema.UniqueArray(
        Schema.Literals([
          "@tsconfig/node22/tsconfig.json",
          "./base.json",
          PRESET,
          OTHER_PRESET,
          "./other.json",
        ])
      ).check(Schema.isMaxLength(4))
    ),
  ])

  const userConfig = Schema.Struct({
    compilerOptions: Schema.Union([
      Schema.Struct({ strict: Schema.Literal(true) }),
      Schema.Struct({ module: Schema.Literal("esnext"), strict: Schema.Literal(false) }),
      Schema.Struct({}),
    ]),
    include: Schema.Union([
      Schema.mutable(Schema.Tuple([Schema.Literal("src/**/*")])),
      Schema.mutable(Schema.Tuple([Schema.Literal("src"), Schema.Literal("test")])),
    ]),
  })

  it.effect.prop(
    "keep user extends entries in order, add the preset exactly once, and drop the other preset",
    { config: userConfig, extendsValue: userExtends },
    ({ config, extendsValue }) =>
      Effect.gen(function* () {
        const original = extendsValue === null ? config : { ...config, extends: extendsValue }
        const files = makeFiles({ "tsconfig.json": yield* stringifyJson(original) })

        yield* tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))

        const mergedExtends = readExtends(files)
        expect(mergedExtends.filter((entry) => entry === PRESET)).toHaveLength(1)

        const userEntries =
          extendsValue === null
            ? []
            : (Array.isArray(extendsValue) ? extendsValue : [extendsValue]).filter(
                (entry) => entry !== PRESET && entry !== OTHER_PRESET
              )

        expect(mergedExtends.filter((entry) => entry !== PRESET)).toStrictEqual(userEntries)

        const parsed = readTsConfig(files)
        expect(parsed.compilerOptions).toStrictEqual({ ...config.compilerOptions })
        expect(parsed.include).toStrictEqual(config.include)
      }),
    { arbitrary: { runs: 150 } }
  )

  it.effect.prop(
    "write the same config no matter how often update runs",
    { config: userConfig, extendsValue: userExtends },
    ({ config, extendsValue }) =>
      Effect.gen(function* () {
        const original = extendsValue === null ? config : { ...config, extends: extendsValue }
        const files = makeFiles({ "tsconfig.json": yield* stringifyJson(original) })

        yield* tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))
        const afterFirst = files.read("tsconfig.json")

        yield* tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))
        expect(files.read("tsconfig.json")).toBe(afterFirst)
      }),
    { arbitrary: { runs: 150 } }
  )
})
