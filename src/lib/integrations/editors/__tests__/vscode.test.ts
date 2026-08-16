import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import vscode from "#lib/integrations/editors/vscode.ts"

const ROOT = "/project"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("vscode", () => {
  describe("detect", () => {
    it.effect("detect when .vscode/settings.json does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const exists = yield* vscode.detect(ROOT).pipe(provideFiles(files))

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create .vscode/settings.json", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* vscode.create(ROOT).pipe(provideFiles(files))

        const exists = yield* vscode.detect(ROOT).pipe(provideFiles(files))
        expect(exists).toBe(true)

        const config = JSON.parse(files.read(".vscode/settings.json"))

        expect(config).toHaveProperty(["editor.formatOnSave"])
        expect(config["editor.formatOnSave"]).toBe(true)
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing .vscode/settings.json config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": JSON.stringify(
            {
              "editor.tabSize": 4,
              "files.autoSave": "afterDelay",
            },
            null,
            2
          ),
        })

        const existsBefore = yield* vscode.detect(ROOT).pipe(provideFiles(files))
        expect(existsBefore).toBe(true)
        yield* vscode.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(".vscode/settings.json"))

        expect(config["editor.tabSize"]).toBe(4)
        expect(config["files.autoSave"]).toBe("afterDelay")
        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": JSON.stringify({ "editor.tabSize": 4 }, null, 2),
        })

        yield* vscode.update(ROOT).pipe(provideFiles(files))
        const firstUpdate = files.read(".vscode/settings.json")
        yield* vscode.update(ROOT).pipe(provideFiles(files))
        const secondUpdate = files.read(".vscode/settings.json")

        expect(secondUpdate).toBe(firstUpdate)
      })
    )

    it.effect("merge an empty config with Adamantite's config", () =>
      Effect.gen(function* () {
        const files = makeFiles({ ".vscode/settings.json": "{}" })

        yield* vscode.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(".vscode/settings.json"))

        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })
    )

    it.effect("return InvalidConfigFormat when the config is not a JSON object", () =>
      Effect.gen(function* () {
        const files = makeFiles({ ".vscode/settings.json": "[]" })

        const result = yield* Effect.result(vscode.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )

    it.effect("return FailedToReadFile when the config does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* Effect.result(vscode.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return FailedToWriteFile when writing the config fails", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ".vscode/settings.json": JSON.stringify({ "editor.tabSize": 2 }),
        })
        files.makeReadOnly(".vscode/settings.json")

        const result = yield* Effect.result(vscode.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
