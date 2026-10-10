import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import zed from "#lib/integrations/editors/zed.ts"

const ROOT = "/project"

const SETTINGS_PATH = ".zed/settings.json"

const OXFMT_FORMATTER = { language_server: { name: "oxfmt" } }
const OXC_FIX_ALL = { code_action: "source.fixAll.oxc" }

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
        expect(yield* zed.assess(ROOT, {}).pipe(provideFiles(files))).toStrictEqual({
          applicable: false,
          warnings: [],
        })
      })
    )
  })

  describe("create", () => {
    it.effect("create .zed/settings.json with type-aware Oxlint on type", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* zed.create(ROOT).pipe(provideFiles(files))

        expect(yield* zed.detect(ROOT).pipe(provideFiles(files))).toBe(true)
        expect(JSON.parse(files.read(SETTINGS_PATH))).toMatchObject({
          lsp: {
            oxlint: { initialization_options: { settings: { run: "onType", typeAware: true } } },
          },
        })
      })
    )
  })

  describe("update", () => {
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

        expect(config.languages.JavaScript.formatter).toStrictEqual([
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

        expect(config.lsp.custom.initialization_options.arguments).toStrictEqual([
          "--flag",
          "--flag",
        ])
        expect(config.languages.JavaScript.formatter).toStrictEqual([OXFMT_FORMATTER, OXC_FIX_ALL])
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

        expect(config.languages.Svelte.formatter).toStrictEqual(formatter)
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
        expect(config.languages.Astro.prettier.plugins).toStrictEqual(["prettier-plugin-astro"])
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

        expect(config.languages.JavaScript.formatter).toStrictEqual([
          OXFMT_FORMATTER,
          OXC_FIX_ALL,
          formatter,
        ])
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

        expect(secondUpdate).toBe(firstUpdate)
        expect(JSON.parse(secondUpdate).ui_font_size).toBe(14)
      })
    )

    it.effect("keep the comments of the existing config", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: '// Zed settings\n{\n  // Light theme\n  "theme": "One Light",\n}\n',
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const content = files.read(SETTINGS_PATH)

        expect(content).toMatch(
          /^\/\/ Zed settings\n\{\n {2}\/\/ Light theme\n {2}"theme": "One Light",\n/u
        )
        expect(content).toContain('"format_on_save": "on"')
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
  })
})
