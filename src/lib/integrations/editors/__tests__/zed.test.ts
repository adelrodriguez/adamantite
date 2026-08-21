import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import zed from "#lib/integrations/editors/zed.ts"

const ROOT = "/project"

const SETTINGS_PATH = ".zed/settings.json"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide(Layer.mergeAll(files.layer, Path.layer))
}

describe("zed", () => {
  describe("assess", () => {
    it.effect("report stale oxfmt settings and preserve changed values", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({
            lsp: {
              oxfmt: {
                initialization_options: {
                  settings: {
                    configPath: null,
                    typeAware: true,
                    unusedDisableDirectives: false,
                  },
                },
              },
            },
          }),
        })

        const result = yield* zed.assess(ROOT, {}).pipe(provideFiles(files))

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("configPath"),
              id: "legacy-zed-oxfmt-settings",
            },
          ],
        })
        if (result.applicable) {
          expect(result.findings[0]?.currentState).not.toContain("typeAware")
        }
      })
    )

    it.effect("ignore a missing settings file", () =>
      Effect.gen(function* () {
        const files = makeFiles()
        expect(yield* zed.assess(ROOT, {}).pipe(provideFiles(files))).toEqual({
          applicable: false,
          warnings: [],
        })
      })
    )
  })

  describe("detect", () => {
    it.effect("detect when .zed/settings.json does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const exists = yield* zed.detect(ROOT).pipe(provideFiles(files))

        expect(exists).toBe(false)
      })
    )
  })

  describe("create", () => {
    it.effect("create .zed/settings.json", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* zed.create(ROOT).pipe(provideFiles(files))

        const exists = yield* zed.detect(ROOT).pipe(provideFiles(files))
        expect(exists).toBe(true)

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.lsp.oxlint.initialization_options.settings.run).toBe("onType")
        expect(config.languages.JavaScript.format_on_save).toBe("on")
        expect(config.languages.Astro).toEqual({
          format_on_save: "on",
          prettier: { allowed: true, plugins: ["prettier-plugin-astro"] },
        })
      })
    )
  })

  describe("update", () => {
    it.effect("update an existing .zed/settings.json config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify(
            {
              ui_font_size: 14,
            },
            null,
            2
          ),
        })

        const existsBefore = yield* zed.detect(ROOT).pipe(provideFiles(files))
        expect(existsBefore).toBe(true)
        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.ui_font_size).toBe(14)
        expect(config.lsp.oxfmt.initialization_options.settings.run).toBe("onSave")
      })
    )

    it.effect("deduplicate formatter entries for managed languages", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({
            languages: {
              JavaScript: {
                formatter: [
                  { language_server: { name: "oxfmt" } },
                  { language_server: { name: "oxfmt" } },
                ],
              },
            },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.languages.JavaScript.formatter).toEqual([
          { language_server: { name: "oxfmt" } },
          { code_action: "source.fixAll.oxc" },
        ])
      })
    )

    it.effect("preserve repeated values in user-owned arrays", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({
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
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.lsp.custom.initialization_options.arguments).toEqual(["--flag", "--flag"])
        expect(config.languages.JavaScript.formatter).toHaveLength(2)
      })
    )

    it.effect("preserve formatter entries for unmanaged languages", () =>
      Effect.gen(function* () {
        const formatter = [{ external: "custom" }, { external: "custom" }]
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({ languages: { Svelte: { formatter } } }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.languages.Svelte.formatter).toEqual(formatter)
      })
    )

    it.effect("deduplicate prettier plugins for the managed Astro entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({
            languages: {
              Astro: { prettier: { allowed: true, plugins: ["prettier-plugin-astro"] } },
            },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.languages.Astro.formatter).toBeUndefined()
        expect(config.languages.Astro.prettier.plugins).toEqual(["prettier-plugin-astro"])
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
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({
            languages: { JavaScript: { formatter: [formatter, formatter] } },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.languages.JavaScript.formatter).toContainEqual(formatter)
        expect(config.languages.JavaScript.formatter).toHaveLength(3)
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({ ui_font_size: 14 }, null, 2),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))
        const firstUpdate = files.read(SETTINGS_PATH)
        yield* zed.update(ROOT).pipe(provideFiles(files))
        const secondUpdate = files.read(SETTINGS_PATH)
        const config = JSON.parse(secondUpdate)

        expect(secondUpdate).toBe(firstUpdate)
        expect(config.languages.JavaScript.formatter).toHaveLength(2)
        expect(config.languages.JSON.formatter).toHaveLength(1)
      })
    )

    it.effect("merge an empty config with Adamantite's config", () =>
      Effect.gen(function* () {
        const files = makeFiles({ [SETTINGS_PATH]: "{}" })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = JSON.parse(files.read(SETTINGS_PATH))

        expect(config.lsp.oxlint.initialization_options.settings.run).toBe("onType")
        expect(config.languages.JavaScript.format_on_save).toBe("on")
      })
    )

    it.effect("return InvalidConfigFormat when the config is not a JSON object", () =>
      Effect.gen(function* () {
        const files = makeFiles({ [SETTINGS_PATH]: "[]" })

        const result = yield* Effect.result(zed.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "InvalidConfigFormat" })
        }
      })
    )

    it.effect("return FailedToReadFile when the config does not exist", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        const result = yield* Effect.result(zed.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToReadFile" })
        }
      })
    )

    it.effect("return FailedToWriteFile when writing the config fails", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: JSON.stringify({
            ui_font_size: 12,
          }),
        })
        files.makeReadOnly(SETTINGS_PATH)

        const result = yield* Effect.result(zed.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure).toMatchObject({ _tag: "FailedToWriteFile" })
        }
      })
    )
  })
})
