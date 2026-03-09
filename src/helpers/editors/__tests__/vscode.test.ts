import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import { isLeft, runEither } from "#__tests__/helpers.ts"
import { vscode } from "#helpers/editors/vscode.ts"

describe("vscode", () => {
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

  describe("exists", () => {
    test("detect when .vscode/settings.json does not exist", async () => {
      const exists = await vscode
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(exists).toBe(false)
    })
  })

  describe("create", () => {
    test("create .vscode/settings.json", async () => {
      await vscode.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const exists = await vscode
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(exists).toBe(true)

      const content = await Bun.file(".vscode/settings.json").text()
      const config = JSON.parse(content)

      expect(config).toHaveProperty(["editor.formatOnSave"])
      expect(config["editor.formatOnSave"]).toBe(true)
    })
  })

  describe("update", () => {
    test("update an existing .vscode/settings.json config", async () => {
      mkdirSync(".vscode", { recursive: true })
      await Bun.write(
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

      const existsBefore = await vscode
        .exists(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(existsBefore).toBe(true)

      await vscode.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".vscode/settings.json").text()
      const config = JSON.parse(content)

      expect(config["editor.tabSize"]).toBe(4)
      expect(config["files.autoSave"]).toBe("afterDelay")
      expect(config["editor.formatOnSave"]).toBe(true)
      expect(config["editor.formatOnPaste"]).toBe(true)
    })

    test("merge an empty config with Adamantite's config", async () => {
      mkdirSync(".vscode", { recursive: true })
      await Bun.write(".vscode/settings.json", "{}")

      await vscode.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(".vscode/settings.json").text()
      const config = JSON.parse(content)

      expect(config["editor.formatOnSave"]).toBe(true)
      expect(config["editor.formatOnPaste"]).toBe(true)
    })

    test("return InvalidConfigFormat when the config is not a JSON object", async () => {
      mkdirSync(".vscode", { recursive: true })
      await Bun.write(".vscode/settings.json", "[]")

      const result = await runEither(vscode.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })

    test("return FailedToReadFile when the config does not exist", async () => {
      const result = await runEither(vscode.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("return FailedToWriteFile when writing the config fails", async () => {
      mkdirSync(".vscode", { recursive: true })
      await Bun.write(
        ".vscode/settings.json",
        JSON.stringify({
          "editor.tabSize": 2,
        })
      )
      chmodSync(".vscode/settings.json", 0o444)

      const result = await runEither(vscode.update(tempDir))
      expect(isLeft(result)).toBe(true)
      if (isLeft(result)) {
        expect(result.left).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })
})
