import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { updateTsconfigPlugin } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/tsconfig.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({
    files: { "package.json": JSON.stringify({ name: "test-project" }), ...files },
    root: ROOT,
  })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("tsconfig", () => {
  describe("updateTsconfigPlugin", () => {
    it.effect("append the entry and keep other plugins and options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({
            compilerOptions: { plugins: [{ name: "other" }], strict: true },
            extends: "adamantite/typescript",
          }),
        })

        const result = yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(result).toBe("updated")
        expect(JSON.parse(files.read("tsconfig.json"))).toEqual({
          compilerOptions: {
            plugins: [{ name: "other" }, { diagnostics: false, name: "@effect/language-service" }],
            strict: true,
          },
          extends: "adamantite/typescript",
        })
      })
    )

    it.effect("turn off diagnostics in an existing entry and keep its options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({
            compilerOptions: {
              plugins: [{ allowedUnstableApis: ["effect/cli"], name: "@effect/language-service" }],
            },
          }),
        })

        yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(JSON.parse(files.read("tsconfig.json"))).toEqual({
          compilerOptions: {
            plugins: [
              {
                allowedUnstableApis: ["effect/cli"],
                diagnostics: false,
                name: "@effect/language-service",
              },
            ],
          },
        })
      })
    )

    it.effect("report a missing tsconfig.json without creating one", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(result).toBe("missing")
        expect(files.exists("tsconfig.json")).toBe(false)
      })
    )

    it.effect("fail on plugins that are not an array", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": JSON.stringify({ compilerOptions: { plugins: {} } }),
        })

        const result = yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files), Effect.result)

        expect(Result.isFailure(result) && result.failure._tag).toBe("InvalidConfigFormat")
      })
    )
  })
})
