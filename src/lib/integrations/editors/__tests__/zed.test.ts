import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import zed from "#lib/integrations/editors/zed.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { formatJson, parseJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"
import { effectEditorFiles, effectEditorResolver } from "./effect-fixture.ts"

const ROOT = "/project"

const SETTINGS_PATH = ".zed/settings.json"

const OXFMT_FORMATTER = { language_server: { name: "oxfmt" } }
const OXC_FIX_ALL = { code_action: "source.fixAll.oxc" }
const OXLINT_ENTRY = "node_modules/adamantite/dist/oxlint.js"

function makeFiles(files?: Record<string, string>) {
  return createFileSystemTestContext({ files, root: ROOT })
}

function provideFiles(files: FileSystemTestContext) {
  return Effect.provide([
    files.layer,
    Path.layer,
    effectEditorResolver(ROOT, files.exists("node_modules/@effect/tsgo/package.json")),
  ])
}

describe("zed", () => {
  describe("assess", () => {
    it.effect("report stale oxfmt settings and preserve changed values", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
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
          "package.json": "{}",
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => zed.assess(project)),
          provideFiles(files)
        )

        expect(result).toMatchObject({
          applicable: true,
          findings: [
            {
              currentState: expect.stringContaining("configPath"),
              id: "legacy-zed-oxfmt-settings",
            },
            { id: "zed-oxlint-entry" },
          ],
        })

        if (result.applicable) {
          expect(result.findings[0]?.currentState).not.toContain("typeAware")
        }
      })
    )

    it.effect("ignore a missing settings file", () =>
      Effect.gen(function* () {
        const files = makeFiles({ "package.json": "{}" })
        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => zed.assess(project)),
            provideFiles(files)
          )
        ).toStrictEqual({
          applicable: false,
        })
      })
    )
  })

  describe("create", () => {
    it.effect("reach an ancestor Effect install and report a stale local command", () =>
      Effect.gen(function* () {
        const cwd = `${ROOT}/packages/app`
        const settingsPath = `packages/app/${SETTINGS_PATH}`
        const files = makeFiles({ ...effectEditorFiles(), "packages/app/package.json": "{}" })
        yield* zed.create(ROOT).pipe(provideFiles(files))
        files.write(settingsPath, files.read(SETTINGS_PATH))

        const stale = yield* readProject(cwd).pipe(
          Effect.flatMap((project) => zed.assess(project)),
          provideFiles(files)
        )

        expect(stale).toMatchObject({ findings: [{ id: "zed-effect-server" }] })

        yield* zed.update(cwd).pipe(provideFiles(files))
        const updated = files.read(settingsPath)
        const config = yield* parseJson(updated)
        expect(config).toHaveProperty(["lsp", "typescript-ls", "binary"], {
          arguments: [
            "../../node_modules/@effect/tsgo/dist/effect-tsgo.cjs",
            "tsc",
            "--lsp",
            "--stdio",
          ],
          path: "node",
        })

        const healthy = yield* readProject(cwd).pipe(
          Effect.flatMap((project) => zed.assess(project)),
          provideFiles(files)
        )

        expect(healthy).toMatchObject({ findings: [] })

        yield* zed.create(cwd).pipe(provideFiles(files))
        expect(yield* parseJson(files.read(settingsPath))).toStrictEqual(config)
      })
    )

    it.effect(
      "select the installed Effect server for all JavaScript and TypeScript languages",
      () =>
        Effect.gen(function* () {
          const files = makeFiles(effectEditorFiles())

          yield* zed.create(ROOT).pipe(provideFiles(files))

          const config = yield* parseJson(files.read(SETTINGS_PATH))
          expect(config).toHaveProperty(["lsp", "typescript-ls", "binary"], {
            arguments: [
              "node_modules/@effect/tsgo/dist/effect-tsgo.cjs",
              "tsc",
              "--lsp",
              "--stdio",
            ],
            path: "node",
          })

          for (const language of ["JavaScript", "JSX", "TypeScript", "TSX"]) {
            expect(config).toHaveProperty(
              ["languages", language, "language_servers"],
              ["typescript-ls", "!vtsls", "!typescript-language-server", "..."]
            )
          }

          expect(config).toHaveProperty(
            [
              "lsp",
              "oxlint",
              "initialization_options",
              "settings",
              "rulesCustomization",
              "effecttsgo/floating-effect",
              "severity",
            ],
            "off"
          )
        })
    )

    it.effect("create .zed/settings.json with type-aware Oxlint on type", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* zed.create(ROOT).pipe(provideFiles(files))

        expect(yield* zed.detect(ROOT).pipe(provideFiles(files))).toBe(true)
        expect(yield* parseJson(files.read(SETTINGS_PATH))).toMatchObject({
          lsp: {
            oxlint: {
              binary: { arguments: [OXLINT_ENTRY, "--lsp"], path: "node" },
              initialization_options: { settings: { run: "onType", typeAware: true } },
            },
          },
        })
      })
    )
  })

  describe("update", () => {
    it.effect("migrate the old tsgo server and preserve other servers and settings", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          ...effectEditorFiles(),
          [SETTINGS_PATH]: yield* stringifyJson({
            languages: {
              TypeScript: { language_servers: ["tsgo", "tailwindcss-language-server", "..."] },
            },
            lsp: {
              oxlint: {
                initialization_options: {
                  settings: { rulesCustomization: { eqeqeq: { severity: "hint" } } },
                },
              },
              tsgo: {
                binary: { arguments: ["--lsp", "--stdio"], path: "old-tsgo" },
                settings: { typescript: { inlayHints: { parameterTypes: { enabled: true } } } },
              },
              "typescript-ls": { initialization_options: { teamSetting: true } },
            },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))
        const first = files.read(SETTINGS_PATH)
        const config = yield* parseJson(first)
        expect(config).not.toHaveProperty(["lsp", "tsgo"])
        expect(config).toMatchObject({
          lsp: {
            oxlint: {
              initialization_options: {
                settings: { rulesCustomization: { eqeqeq: { severity: "hint" } } },
              },
            },
            "typescript-ls": {
              initialization_options: { teamSetting: true },
              settings: { typescript: { inlayHints: { parameterTypes: { enabled: true } } } },
            },
          },
        })
        expect(config).toHaveProperty(
          ["languages", "TypeScript", "language_servers"],
          [
            "typescript-ls",
            "!vtsls",
            "!typescript-language-server",
            "tailwindcss-language-server",
            "...",
          ]
        )
        yield* zed.update(ROOT).pipe(provideFiles(files))
        expect(files.read(SETTINGS_PATH)).toBe(first)
        expect(
          yield* readProject(ROOT).pipe(
            Effect.flatMap((project) => zed.assess(project)),
            provideFiles(files)
          )
        ).toMatchObject({ findings: [] })
      })
    )

    it.effect("deduplicate formatter entries for managed languages", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
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

        const config = yield* parseJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(
          ["languages", "JavaScript", "formatter"],
          [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }]
        )
      })
    )

    it.effect("preserve repeated values in user-owned arrays", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
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

        const config = yield* parseJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(
          ["lsp", "custom", "initialization_options", "arguments"],
          ["--flag", "--flag"]
        )
        expect(config).toHaveProperty(
          ["languages", "JavaScript", "formatter"],
          [OXFMT_FORMATTER, OXC_FIX_ALL]
        )
      })
    )

    it.effect("preserve formatter entries for unmanaged languages", () =>
      Effect.gen(function* () {
        const formatter = [{ external: "custom" }, { external: "custom" }]

        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({ languages: { Svelte: { formatter } } }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* parseJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(["languages", "Svelte", "formatter"], formatter)
      })
    )

    it.effect("deduplicate prettier plugins for the managed Astro entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
            languages: {
              Astro: { prettier: { allowed: true, plugins: ["prettier-plugin-astro"] } },
            },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* parseJson(files.read(SETTINGS_PATH))

        expect(config).not.toHaveProperty(["languages", "Astro", "formatter"])
        expect(config).toHaveProperty(
          ["languages", "Astro", "prettier", "plugins"],
          ["prettier-plugin-astro"]
        )
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
          [SETTINGS_PATH]: yield* stringifyJson({
            languages: { JavaScript: { formatter: [formatter, formatter] } },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* parseJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(
          ["languages", "JavaScript", "formatter"],
          [OXFMT_FORMATTER, OXC_FIX_ALL, formatter]
        )
      })
    )

    it.effect("replace the Oxlint binary of the existing config with the Oxlint entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
            lsp: {
              oxlint: {
                binary: { arguments: ["--lsp"], path: "node_modules/.bin/oxlint" },
                initialization_options: { settings: { run: "onSave" } },
              },
            },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        expect(yield* parseJson(files.read(SETTINGS_PATH))).toHaveProperty(
          ["lsp", "oxlint", "binary"],
          {
            arguments: [OXLINT_ENTRY, "--lsp"],
            path: "node",
          }
        )
      })
    )

    it.effect("remain idempotent across repeated updates", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* formatJson({ ui_font_size: 14 }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))
        const firstUpdate = files.read(SETTINGS_PATH)
        yield* zed.update(ROOT).pipe(provideFiles(files))
        const secondUpdate = files.read(SETTINGS_PATH)

        expect(secondUpdate).toBe(firstUpdate)
        expect(yield* parseJson(secondUpdate)).toHaveProperty(["ui_font_size"], 14)
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
          expect(result.failure).toBeInstanceOf(InvalidConfigFormat)
        }
      })
    )
  })
})
