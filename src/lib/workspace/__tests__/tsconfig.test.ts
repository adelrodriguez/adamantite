import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("tsconfig", () => {
  describe("detect", () => {
    it.effect("detect when tsconfig.json does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const exists = yield* tsconfig.detect(ROOT).pipe(provideFiles(files))

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create tsconfig.json with the correct config", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* tsconfig.create(ROOT).pipe(provideFiles(files))

        const exists = yield* tsconfig.detect(ROOT).pipe(provideFiles(files))
        expect(exists).toBe(true)

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config).toHaveProperty("extends")
        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("handle write failures when creating tsconfig.json", () =>
      Effect.gen(function* () {
        const files = makeFiles()
        files.makeReadOnly("readonly-dir")

        const result = yield* Effect.result(
          tsconfig.create(`${ROOT}/readonly-dir`).pipe(provideFiles(files))
        )

        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing tsconfig.json config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify(
            {
              compilerOptions: {
                strict: true,
                target: "ES2020",
              },
              include: ["src/**/*"],
            },
            null,
            2
          ),
        })

        const existsBefore = yield* tsconfig.detect(ROOT).pipe(provideFiles(files))

        expect(existsBefore).toBe(true)
        yield* tsconfig.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config.compilerOptions).toEqual({
          strict: true,
          target: "ES2020",
        })
        expect(config.include).toEqual(["src/**/*"])
        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("append the preset to an existing extends string instead of overwriting it", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify(
            {
              compilerOptions: {
                target: "ES2020",
              },
              extends: "@company/tsconfig",
            },
            null,
            2
          ),
        })

        yield* tsconfig.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config.extends).toEqual(["@company/tsconfig", "adamantite/typescript"])
        expect(config.compilerOptions).toEqual({ target: "ES2020" })
      })
    )

    it.effect("keep extends as a string when it is already the preset", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({ extends: "adamantite/typescript" }, null, 2),
        })

        yield* tsconfig.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("append the preset to an existing extends array", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify(
            { extends: ["@company/tsconfig", "@company/tsconfig-strict"] },
            null,
            2
          ),
        })

        yield* tsconfig.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config.extends).toEqual([
          "@company/tsconfig",
          "@company/tsconfig-strict",
          "adamantite/typescript",
        ])
      })
    )

    it.effect("leave an extends array unchanged when it already contains the preset", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify(
            { extends: ["adamantite/typescript", "@company/tsconfig"] },
            null,
            2
          ),
        })

        yield* tsconfig.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config.extends).toEqual(["adamantite/typescript", "@company/tsconfig"])
      })
    )

    it.effect("merge an empty config with Adamantite's config", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "tsconfig.json": "{}" })

        yield* tsconfig.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read("tsconfig.json"))

        expect(config.extends).toBe("adamantite/typescript")
      })
    )

    it.effect("return InvalidConfigFormat when tsconfig.json is not a JSON object", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "tsconfig.json": "true" })

        const result = yield* Effect.result(tsconfig.update(ROOT).pipe(provideFiles(files)))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )

    it.effect("return FailedToReadFile when the config does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* Effect.result(tsconfig.update(ROOT).pipe(provideFiles(files)))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return FailedToWriteFile when writing the config fails", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({
            compilerOptions: {
              target: "ES2020",
            },
          }),
        })
        files.makeReadOnly("tsconfig.json")

        const result = yield* Effect.result(tsconfig.update(ROOT).pipe(provideFiles(files)))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
