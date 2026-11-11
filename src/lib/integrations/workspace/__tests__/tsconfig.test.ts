import type { TsConfigJson } from "type-fest"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { makeModuleResolverLayer } from "#__tests__/module-resolver.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer, makeModuleResolverLayer(ROOT)])
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
      {
        configFiles: { "tsconfig.json": JSON.stringify({ extends: ["./base.json"] }) },
        name: "an extends array without the preset",
      },
    ])("skip a project with $name, whatever its scripts", ({ configFiles }) =>
      Effect.gen(function* () {
        for (const scripts of [undefined, { check: "adamantite check" }]) {
          const files = makeFiles({
            "package.json": yield* stringifyJson({ ...packageJson, scripts }),
            ...configFiles,
          })

          const result = yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => tsconfig.assess(project)),
            provideFiles(files)
          )

          expect(result).toStrictEqual({ applicable: false })
        }
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
          const files = makeFiles({
            "package.json": yield* stringifyJson(packageJson),
            "tsconfig.json": yield* stringifyJson({ extends: preset }),
          })

          const result = yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => tsconfig.assess(project)),
            provideFiles(files)
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
        name: "report a library with exports that extends",
        preset: "adamantite/typescript",
      },
      {
        expected: [{ id: "typescript-preset-in-library" }],
        manifest: { name: "library", types: "./dist/index.d.ts" },
        name: "report a library with types that extends",
        preset: "adamantite/typescript",
      },
      {
        expected: [],
        manifest: { exports: "./dist/index.js", name: "app", private: true },
        name: "accept a private package that extends",
        preset: "adamantite/typescript",
      },
      {
        expected: [],
        manifest: { name: "app" },
        name: "accept a package without exports or types that extends",
        preset: "adamantite/typescript",
      },
      {
        expected: [],
        manifest: { exports: "./dist/index.js", name: "library" },
        name: "accept a library that extends",
        preset: "adamantite/tsconfig",
      },
    ])("$name $preset", ({ expected, manifest, preset }) =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson(manifest),
          "tsconfig.json": yield* stringifyJson({ extends: preset }),
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => tsconfig.assess(project)),
          provideFiles(files)
        )

        expect(result).toMatchObject({ applicable: true, findings: expected })
      })
    )

    it.effect("report a workspace library that extends adamantite/typescript", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "package.json": yield* stringifyJson({ name: "root", private: true }),
          "packages/app/package.json": yield* stringifyJson({ name: "app", private: true }),
          "packages/app/tsconfig.json": yield* stringifyJson({ extends: "adamantite/typescript" }),
          "packages/library/package.json": yield* stringifyJson({
            exports: "./dist/index.js",
            name: "library",
          }),
          "packages/library/tsconfig.json": yield* stringifyJson({
            extends: "adamantite/typescript",
          }),
          "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => tsconfig.assess(project)),
          provideFiles(files)
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

    it.effect("keep the comments of the existing config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": `{
  // Shared base
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist", // build output
  },
}
`,
        })

        yield* tsconfig.update(ROOT, "typescript").pipe(provideFiles(files))

        expect(files.read("tsconfig.json")).toBe(`{
  // Shared base
  "extends": [
    "./tsconfig.base.json",
    "adamantite/typescript"
  ],
  "compilerOptions": {
    "outDir": "dist", // build output
  },
}
`)
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
