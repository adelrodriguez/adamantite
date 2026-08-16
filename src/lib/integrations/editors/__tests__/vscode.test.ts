import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import vscode from "#lib/integrations/editors/vscode.ts"

layer(NodeServices.layer)("vscode", (it) => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-vscode-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("detect", () => {
    it.effect("detect when .vscode/settings.json does not exist", () =>
      Effect.gen(function* () {
        const exists = yield* vscode.detect(tempDir)

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create .vscode/settings.json", () =>
      Effect.gen(function* () {
        yield* vscode.create(tempDir)

        const exists = yield* vscode.detect(tempDir)
        expect(exists).toBe(true)

        const content = yield* Effect.promise(() => testFile(".vscode/settings.json").text())
        const config = JSON.parse(content)

        expect(config).toHaveProperty(["editor.formatOnSave"])
        expect(config["editor.formatOnSave"]).toBe(true)
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing .vscode/settings.json config", () =>
      Effect.gen(function* () {
        mkdirSync(".vscode", { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            ".vscode/settings.json",
            JSON.stringify(
              {
                "editor.tabSize": 4,
                "files.autoSave": "afterDelay",
              },
              null,
              2
            )
          )
        )

        const existsBefore = yield* vscode.detect(tempDir)
        expect(existsBefore).toBe(true)
        yield* vscode.update(tempDir)

        const content = yield* Effect.promise(() => testFile(".vscode/settings.json").text())
        const config = JSON.parse(content)

        expect(config["editor.tabSize"]).toBe(4)
        expect(config["files.autoSave"]).toBe("afterDelay")
        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        mkdirSync(".vscode", { recursive: true })
        yield* Effect.promise(() =>
          writeFile(".vscode/settings.json", JSON.stringify({ "editor.tabSize": 4 }, null, 2))
        )
        yield* vscode.update(tempDir)
        const firstUpdate = yield* Effect.promise(() => testFile(".vscode/settings.json").text())
        yield* vscode.update(tempDir)
        const secondUpdate = yield* Effect.promise(() => testFile(".vscode/settings.json").text())

        expect(secondUpdate).toBe(firstUpdate)
      })
    )

    it.effect("merge an empty config with Adamantite's config", () =>
      Effect.gen(function* () {
        mkdirSync(".vscode", { recursive: true })
        yield* Effect.promise(() => writeFile(".vscode/settings.json", "{}"))
        yield* vscode.update(tempDir)

        const content = yield* Effect.promise(() => testFile(".vscode/settings.json").text())
        const config = JSON.parse(content)

        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })
    )

    it.effect("return InvalidConfigFormat when the config is not a JSON object", () =>
      Effect.gen(function* () {
        mkdirSync(".vscode", { recursive: true })
        yield* Effect.promise(() => writeFile(".vscode/settings.json", "[]"))

        const result = yield* Effect.result(vscode.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )

    it.effect("return FailedToReadFile when the config does not exist", () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(vscode.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return FailedToWriteFile when writing the config fails", () =>
      Effect.gen(function* () {
        mkdirSync(".vscode", { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            ".vscode/settings.json",
            JSON.stringify({
              "editor.tabSize": 2,
            })
          )
        )
        chmodSync(".vscode/settings.json", 0o444)

        const result = yield* Effect.result(vscode.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
