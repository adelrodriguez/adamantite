import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { afterEach, beforeEach, describe, expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { testFile, writeFile } from "#__tests__/filesystem.ts"
import zed from "#lib/integrations/editors/zed.ts"

layer(NodeServices.layer)("zed", (it) => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-zed-test-"))
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("detect", () => {
    it.effect("detect when .zed/settings.json does not exist", () =>
      Effect.gen(function* () {
        const exists = yield* zed.detect(tempDir)

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create .zed/settings.json", () =>
      Effect.gen(function* () {
        yield* zed.create(tempDir)

        const exists = yield* zed.detect(tempDir)
        expect(exists).toBe(true)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.lsp.oxlint.initialization_options.settings.run).toBe("onType")
        expect(config.languages.JavaScript.format_on_save).toBe("on")
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing .zed/settings.json config", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".zed", "settings.json"),
            JSON.stringify(
              {
                ui_font_size: 14,
              },
              null,
              2
            )
          )
        )

        const existsBefore = yield* zed.detect(tempDir)
        expect(existsBefore).toBe(true)
        yield* zed.update(tempDir)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.ui_font_size).toBe(14)
        expect(config.lsp.oxfmt.initialization_options.settings.run).toBe("onSave")
      })
    )

    it.effect("deduplicate formatter entries for managed languages", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* zed.update(tempDir)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.languages.JavaScript.formatter).toEqual([
          { language_server: { name: "oxfmt" } },
          { code_action: "source.fixAll.oxc" },
        ])
      })
    )

    it.effect("preserve repeated values in user-owned arrays", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
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
        )
        yield* zed.update(tempDir)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.lsp.custom.initialization_options.arguments).toEqual(["--flag", "--flag"])
        expect(config.languages.JavaScript.formatter).toHaveLength(2)
      })
    )

    it.effect("preserve formatter entries for unmanaged languages", () =>
      Effect.gen(function* () {
        const formatter = [{ external: "custom" }, { external: "custom" }]
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".zed", "settings.json"),
            JSON.stringify({ languages: { Astro: { formatter } } })
          )
        )
        yield* zed.update(tempDir)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.languages.Astro.formatter).toEqual(formatter)
      })
    )

    it.effect("preserve repeated values nested in managed formatter entries", () =>
      Effect.gen(function* () {
        const formatter = {
          language_server: {
            arguments: ["--flag", "--flag"],
            name: "custom",
          },
        }
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".zed", "settings.json"),
            JSON.stringify({ languages: { JavaScript: { formatter: [formatter, formatter] } } })
          )
        )
        yield* zed.update(tempDir)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.languages.JavaScript.formatter).toContainEqual(formatter)
        expect(config.languages.JavaScript.formatter).toHaveLength(3)
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".zed", "settings.json"),
            JSON.stringify({ ui_font_size: 14 }, null, 2)
          )
        )
        yield* zed.update(tempDir)
        const firstUpdate = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        yield* zed.update(tempDir)
        const secondUpdate = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(secondUpdate)

        expect(secondUpdate).toBe(firstUpdate)
        expect(config.languages.JavaScript.formatter).toHaveLength(2)
        expect(config.languages.JSON.formatter).toHaveLength(1)
      })
    )

    it.effect("merge an empty config with Adamantite's config", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() => writeFile(join(tempDir, ".zed", "settings.json"), "{}"))
        yield* zed.update(tempDir)

        const content = yield* Effect.promise(() =>
          testFile(join(tempDir, ".zed", "settings.json")).text()
        )
        const config = JSON.parse(content)

        expect(config.lsp.oxlint.initialization_options.settings.run).toBe("onType")
        expect(config.languages.JavaScript.format_on_save).toBe("on")
      })
    )

    it.effect("return InvalidConfigFormat when the config is not a JSON object", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() => writeFile(join(tempDir, ".zed", "settings.json"), "[]"))

        const result = yield* Effect.result(zed.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )

    it.effect("return FailedToReadFile when the config does not exist", () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(zed.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return FailedToWriteFile when writing the config fails", () =>
      Effect.gen(function* () {
        mkdirSync(join(tempDir, ".zed"), { recursive: true })
        yield* Effect.promise(() =>
          writeFile(
            join(tempDir, ".zed", "settings.json"),
            JSON.stringify({
              ui_font_size: 12,
            })
          )
        )
        chmodSync(join(tempDir, ".zed", "settings.json"), 0o444)

        const result = yield* Effect.result(zed.update(tempDir))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
