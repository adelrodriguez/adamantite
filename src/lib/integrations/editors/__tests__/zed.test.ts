import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun from "bun"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { runResult } from "#__tests__/helpers.ts"
import zed from "#lib/integrations/editors/zed.ts"

describe("zed", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-zed-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("detect", () => {
    test("detect when .zed/settings.json does not exist", async () => {
      const exists = await zed
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      expect(exists).toBe(false)
    })
  })

  describe("create", () => {
    test("create .zed/settings.json", async () => {
      await zed.create(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const exists = await zed
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(exists).toBe(true)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.lsp.oxlint.initialization_options.settings.run).toBe("onType")
      expect(config.languages.JavaScript.format_on_save).toBe("on")
    })
  })

  describe("update", () => {
    test("update an existing .zed/settings.json config", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify(
          {
            ui_font_size: 14,
          },
          null,
          2
        )
      )

      const existsBefore = await zed
        .detect(tempDir)
        .pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      expect(existsBefore).toBe(true)

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.ui_font_size).toBe(14)
      expect(config.lsp.oxfmt.initialization_options.settings.run).toBe("onSave")
    })

    test("deduplicate formatter entries for managed languages", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify({
          languages: {
            JavaScript: {
              formatter: [
                { language_server: { name: "oxfmt" } },
                { language_server: { name: "oxfmt" } },
              ],
            },
          },
        })
      )

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.languages.JavaScript.formatter).toEqual([
        { language_server: { name: "oxfmt" } },
        { code_action: "source.fixAll.oxc" },
      ])
    })

    test("preserve repeated values in user-owned arrays", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify({
          languages: {
            JavaScript: {
              formatter: [{ language_server: { name: "oxfmt" } }],
            },
          },
          lsp: {
            custom: {
              initialization_options: {
                arguments: ["--flag", "--flag"],
              },
            },
          },
        })
      )

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.lsp.custom.initialization_options.arguments).toEqual(["--flag", "--flag"])
      expect(config.languages.JavaScript.formatter).toHaveLength(2)
    })

    test("preserve formatter entries for unmanaged languages", async () => {
      const formatter = [{ external: "custom" }, { external: "custom" }]
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify({ languages: { Astro: { formatter } } })
      )

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.languages.Astro.formatter).toEqual(formatter)
    })

    test("preserve repeated values nested in managed formatter entries", async () => {
      const formatter = {
        language_server: {
          arguments: ["--flag", "--flag"],
          name: "custom",
        },
      }
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify({ languages: { JavaScript: { formatter: [formatter, formatter] } } })
      )

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.languages.JavaScript.formatter).toContainEqual(formatter)
      expect(config.languages.JavaScript.formatter).toHaveLength(3)
    })

    test("remain idempotent across repeated updates", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify({ ui_font_size: 14 }, null, 2)
      )

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      const firstUpdate = await Bun.file(join(tempDir, ".zed", "settings.json")).text()

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
      const secondUpdate = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(secondUpdate)

      expect(secondUpdate).toBe(firstUpdate)
      expect(config.languages.JavaScript.formatter).toHaveLength(2)
      expect(config.languages.JSON.formatter).toHaveLength(1)
    })

    test("merge an empty config with Adamantite's config", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(join(tempDir, ".zed", "settings.json"), "{}")

      await zed.update(tempDir).pipe(Effect.provide(NodeServices.layer), Effect.runPromise)

      const content = await Bun.file(join(tempDir, ".zed", "settings.json")).text()
      const config = JSON.parse(content)

      expect(config.lsp.oxlint.initialization_options.settings.run).toBe("onType")
      expect(config.languages.JavaScript.format_on_save).toBe("on")
    })

    test("return InvalidConfigFormat when the config is not a JSON object", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(join(tempDir, ".zed", "settings.json"), "[]")

      const result = await runResult(zed.update(tempDir))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
      }
    })

    test("return FailedToReadFile when the config does not exist", async () => {
      const result = await runResult(zed.update(tempDir))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
      }
    })

    test("return FailedToWriteFile when writing the config fails", async () => {
      mkdirSync(join(tempDir, ".zed"), { recursive: true })
      await Bun.write(
        join(tempDir, ".zed", "settings.json"),
        JSON.stringify({
          ui_font_size: 12,
        })
      )
      chmodSync(join(tempDir, ".zed", "settings.json"), 0o444)

      const result = await runResult(zed.update(tempDir))
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
      }
    })
  })
})
