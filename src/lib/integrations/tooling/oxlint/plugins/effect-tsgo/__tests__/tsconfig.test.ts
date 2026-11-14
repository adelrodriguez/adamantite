import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { decodeJson } from "#__tests__/json.ts"
import { updateTsconfigPlugin } from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/tsconfig.ts"
import { JsoncNotEditable } from "#lib/shared/errors.ts"
import { stringifyJson } from "#lib/shared/json.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({
    files: { "package.json": JSON.stringify({ name: "test-project" }), ...files },
    root: ROOT,
  })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([files.layer, Path.layer])
}

describe("tsconfig", () => {
  describe("updateTsconfigPlugin", () => {
    it.effect("append the entry and keep other plugins and options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": yield* stringifyJson({
            compilerOptions: { plugins: [{ name: "other" }], strict: true },
            extends: "adamantite/typescript",
          }),
        })

        const result = yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(result).toBe("updated")
        expect(yield* decodeJson(files.read("tsconfig.json"))).toStrictEqual({
          compilerOptions: {
            plugins: [{ name: "other" }, { diagnostics: true, name: "@effect/language-service" }],
            strict: true,
          },
          extends: "adamantite/typescript",
        })
      })
    )

    it.effect("turn on diagnostics in an existing entry and keep its options", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          "tsconfig.json": yield* stringifyJson({
            compilerOptions: {
              plugins: [
                {
                  allowedUnstableApis: ["effect/cli"],
                  diagnostics: false,
                  name: "@effect/language-service",
                },
              ],
            },
          }),
        })

        yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect(yield* decodeJson(files.read("tsconfig.json"))).toStrictEqual({
          compilerOptions: {
            plugins: [
              {
                allowedUnstableApis: ["effect/cli"],
                diagnostics: true,
                name: "@effect/language-service",
              },
            ],
          },
        })
      })
    )

    it.effect("leave a config with comments unchanged and fail with JsoncNotEditable", () =>
      Effect.gen(function* () {
        const content = `{
  // Strict project
  "compilerOptions": {
    "strict": true, // keep strict
    "plugins": []
  }
}
`

        const files = makeFiles({ "tsconfig.json": content })

        const result = yield* Effect.result(updateTsconfigPlugin(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)

        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(JsoncNotEditable)
        }

        expect(files.read("tsconfig.json")).toBe(content)
      })
    )

    it.effect("succeed without a write when a config with comments already has the entry", () =>
      Effect.gen(function* () {
        const content = `{
  // Strict project
  "compilerOptions": {
    "plugins": [{ "name": "@effect/language-service", "diagnostics": true }],
  },
}
`

        const files = makeFiles({ "tsconfig.json": content })

        const result = yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files))

        expect({ content: files.read("tsconfig.json"), result }).toStrictEqual({
          content,
          result: "unchanged",
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
          "tsconfig.json": yield* stringifyJson({ compilerOptions: { plugins: {} } }),
        })

        const result = yield* updateTsconfigPlugin(ROOT).pipe(provideFiles(files), Effect.result)

        expect(Result.isFailure(result) && result.failure._tag).toBe("InvalidConfigFormat")
      })
    )
  })
})
