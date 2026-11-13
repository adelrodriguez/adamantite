import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import { type FileSystemTestContext, createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { decodeJson } from "#__tests__/json.ts"
import zed from "#lib/integrations/editors/zed.ts"
import { InvalidConfigFormat, JsoncNotEditable } from "#lib/shared/errors.ts"
import { formatJson, stringifyJson } from "#lib/shared/json.ts"
import { readProject } from "#lib/workspace/project.ts"
import { effectEditorFiles, effectEditorResolver } from "./effect-fixture.ts"

const ROOT = "/project"

const SETTINGS_PATH = ".zed/settings.json"

const OXFMT_FORMATTER = { language_server: { name: "oxfmt" } }
const OXC_FIX_ALL = { code_action: "source.fixAll.oxc" }
const OXLINT_ENTRY = "node_modules/adamantite/dist/oxlint.js"

// The Astro setup that Adamantite wrote before Oxfmt formatted Astro files.
const PRETTIER_ASTRO = {
  format_on_save: "on",
  prettier: { allowed: true, plugins: ["prettier-plugin-astro"] },
}

const OXFMT_LANGUAGE = {
  format_on_save: "on",
  formatter: [OXFMT_FORMATTER],
  prettier: { allowed: false },
}

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

    it.effect("report the Prettier setup that Adamantite wrote for Astro", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({ languages: { Astro: PRETTIER_ASTRO } }),
          "package.json": "{}",
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => zed.assess(project)),
          provideFiles(files)
        )

        expect(result.applicable && result.findings).toContainEqual(
          expect.objectContaining({ id: "legacy-zed-astro-formatter" })
        )
      })
    )

    it.effect("accept an Astro setup that the project changed", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
            languages: { Astro: { ...PRETTIER_ASTRO, format_on_save: "off" } },
          }),
          "package.json": "{}",
        })

        const result = yield* readProject(ROOT).pipe(
          Effect.flatMap((project) => zed.assess(project)),
          provideFiles(files)
        )

        expect(result.applicable && result.findings).not.toContainEqual(
          expect.objectContaining({ id: "legacy-zed-astro-formatter" })
        )
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
        const config = yield* decodeJson(updated)
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
        expect(yield* decodeJson(files.read(settingsPath))).toStrictEqual(config)
      })
    )

    it.effect(
      "select the installed Effect server for all JavaScript and TypeScript languages",
      () =>
        Effect.gen(function* () {
          const files = makeFiles(effectEditorFiles())

          yield* zed.create(ROOT).pipe(provideFiles(files))

          const config = yield* decodeJson(files.read(SETTINGS_PATH))
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
        expect(yield* decodeJson(files.read(SETTINGS_PATH))).toMatchObject({
          languages: { Astro: OXFMT_LANGUAGE, Svelte: OXFMT_LANGUAGE },
          lsp: {
            oxlint: {
              binary: { arguments: [OXLINT_ENTRY, "--lsp"], path: "node" },
              initialization_options: { settings: { run: "onType", typeAware: true } },
            },
          },
        })
      })
    )

    // Without the setting, the Oxlint language server reports unused directives with the severity
    // of `options.reportUnusedDisableDirectives`, which the core preset sets for check and fix.
    it.effect("leave the report of unused directives to the Oxlint config", () =>
      Effect.gen(function* () {
        const files = makeFiles()

        yield* zed.create(ROOT).pipe(provideFiles(files))

        expect(yield* decodeJson(files.read(SETTINGS_PATH))).not.toHaveProperty([
          "lsp",
          "oxlint",
          "initialization_options",
          "settings",
          "unusedDisableDirectives",
        ])
      })
    )
  })

  describe("update", () => {
    it.effect("keep the project's values and set the Oxlint entry", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({
            languages: { TypeScript: { format_on_save: "off", formatter: null } },
            lsp: {
              oxlint: {
                binary: { arguments: ["--lsp"], path: "oxlint" },
                initialization_options: { settings: { run: "onSave" } },
              },
            },
          }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

        expect(config).toMatchObject({
          languages: { TypeScript: { format_on_save: "off", formatter: null } },
          lsp: {
            oxlint: {
              binary: { arguments: [OXLINT_ENTRY, "--lsp"], path: "node" },
              initialization_options: { settings: { run: "onSave" } },
            },
          },
        })
      })
    )

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
        const config = yield* decodeJson(first)
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

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

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

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

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
          [SETTINGS_PATH]: yield* stringifyJson({ languages: { Python: { formatter } } }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(["languages", "Python", "formatter"], formatter)
      })
    )

    it.effect("move the Prettier setup that Adamantite wrote for Astro to Oxfmt", () =>
      Effect.gen(function* () {
        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({ languages: { Astro: PRETTIER_ASTRO } }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(["languages", "Astro"], OXFMT_LANGUAGE)
      })
    )

    it.effect("keep a Svelte setup that the project wrote", () =>
      Effect.gen(function* () {
        const svelte = {
          format_on_save: "on",
          prettier: { allowed: true, plugins: ["prettier-plugin-svelte"] },
        }

        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({ languages: { Svelte: svelte } }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(["languages", "Svelte"], svelte)
      })
    )

    it.effect("keep the Prettier formatter of an Astro setup that the project changed", () =>
      Effect.gen(function* () {
        // Zed uses an explicit `formatter` before Prettier, so a merged Oxfmt formatter would stop
        // the project's Prettier plugins.
        const astro = {
          ...PRETTIER_ASTRO,
          prettier: {
            allowed: true,
            plugins: ["prettier-plugin-astro", "prettier-plugin-tailwindcss"],
          },
        }

        const files = makeFiles({
          [SETTINGS_PATH]: yield* stringifyJson({ languages: { Astro: astro } }),
        })

        yield* zed.update(ROOT).pipe(provideFiles(files))

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(["languages", "Astro"], astro)
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

        const config = yield* decodeJson(files.read(SETTINGS_PATH))

        expect(config).toHaveProperty(
          ["languages", "JavaScript", "formatter"],
          [formatter, OXFMT_FORMATTER, OXC_FIX_ALL]
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

        expect(yield* decodeJson(files.read(SETTINGS_PATH))).toHaveProperty(
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
        expect(yield* decodeJson(secondUpdate)).toHaveProperty(["ui_font_size"], 14)
      })
    )

    it.effect("leave a config with comments unchanged and fail with JsoncNotEditable", () =>
      Effect.gen(function* () {
        const content = '// Zed settings\n{\n  // Light theme\n  "theme": "One Light",\n}\n'
        const files = makeFiles({ [SETTINGS_PATH]: content })

        const result = yield* Effect.result(zed.update(ROOT).pipe(provideFiles(files)))

        expect(Result.isFailure(result)).toBe(true)

        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(JsoncNotEditable)
        }

        expect(files.read(SETTINGS_PATH)).toBe(content)
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
