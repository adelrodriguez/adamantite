import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type { Project } from "#lib/workspace/project.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { readEffectEditor } from "#lib/integrations/editors/effect.ts"
import { EDITOR_OXLINT_ENTRY } from "#lib/integrations/tooling/oxlint/entry.ts"
import { EffectEditorUnavailable, InvalidConfigFormat } from "#lib/shared/errors.ts"
import {
  ensureDirectory,
  readFile,
  readFileIfExists,
  writeFile,
  writeJsonFile,
} from "#lib/shared/filesystem.ts"
import {
  checkIsJsonArray,
  checkIsJsonObject,
  formatJson,
  mergeConfig,
  parseJson,
  stringifyJson,
  updateJsonText,
} from "#lib/shared/json.ts"
import { formatInitCommand } from "#lib/workspace/init-command.ts"

const files = [{ path: ".zed/settings.json", type: "config" }] as const

const CONFIG = {
  languages: {
    // The format preset turns on Oxfmt's `astro` option, which needs Astro 7 or later. See ADR 0028.
    Astro: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    CSS: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    HTML: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    JSON: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    JSONC: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    JavaScript: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      prettier: { allowed: false },
    },
    MDX: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    Markdown: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    TSX: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      prettier: { allowed: false },
    },
    TypeScript: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      prettier: { allowed: false },
    },
    YAML: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
  },
  lsp: {
    oxfmt: {
      initialization_options: {
        settings: {
          "fmt.configPath": null,
          run: "onSave",
        },
      },
    },
    // Zed starts the language server in the worktree root, so the relative entry path resolves. The
    // entry finds the project from that path and loads the project's Oxlint runtime.
    oxlint: {
      binary: { arguments: [EDITOR_OXLINT_ENTRY, "--lsp"], path: "node" },
      initialization_options: {
        settings: {
          configPath: null,
          fixKind: "safe_fix",
          run: "onType",
          typeAware: true,
          unusedDisableDirectives: "deny",
        },
      },
    },
  },
} as const

/**
 * The Astro setup that Adamantite wrote before Oxfmt formatted Astro files: Zed's managed Prettier
 * with the Astro plugin. Update replaces it, and keeps an Astro setup that the project changed.
 */
const PRETTIER_ASTRO_SETTINGS = {
  format_on_save: "on",
  prettier: { allowed: true, plugins: ["prettier-plugin-astro"] },
} as const satisfies Schema.Json

/**
 * Whether `config` keeps the Astro setup that Adamantite wrote before Oxfmt formatted Astro files.
 */
function checkHasPrettierAstro(config: Schema.JsonObject) {
  return (
    checkIsJsonObject(config.languages)
    && Equal.equals(config.languages["Astro"], PRETTIER_ASTRO_SETTINGS)
  )
}

const STALE_OXFMT_SETTINGS = {
  configPath: null,
  "fmt.experimental": true,
  typeAware: false,
  unusedDisableDirectives: false,
} as const satisfies Record<string, Schema.Json>

const TYPESCRIPT_SERVERS = new Set(["typescript-ls", "tsgo", "vtsls", "typescript-language-server"])

// Keep the logical node_modules path. The resolver's real path can point into a machine's pnpm
// store, which must not go into shared editor settings.
const resolveEffectCli = Effect.fn("resolveEffectCli")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let directory = path.resolve(cwd)

  for (;;) {
    const candidate = path.join(directory, "node_modules", "@effect", "tsgo")

    if (yield* fs.exists(path.join(candidate, "package.json"))) {
      return path
        .relative(cwd, path.join(candidate, "dist", "effect-tsgo.cjs"))
        .replaceAll("\\", "/")
    }

    const parent = path.dirname(directory)

    if (parent === directory) {
      return yield* new EffectEditorUnavailable({
        reason: `Zed cannot find the installed Effect CLI in node_modules. Install @effect/tsgo, then run \`${formatInitCommand({ editors: ["zed"], scripts: ["check"] })}\`.`,
      })
    }

    directory = parent
  }
})

const setEffectSettings = Effect.fn("setEffectSettings")(function* (
  cwd: string,
  config: Schema.JsonObject,
  rulesCustomization: Schema.JsonObject
) {
  const binary = {
    arguments: [yield* resolveEffectCli(cwd), "tsc", "--lsp", "--stdio"],
    path: "node",
  }

  const languages = checkIsJsonObject(config.languages) ? config.languages : {}
  const managedLanguages: Record<string, Schema.Json> = {}

  for (const language of ["JavaScript", "JSX", "TypeScript", "TSX"]) {
    const current = checkIsJsonObject(languages[language]) ? languages[language] : {}

    const parsed = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.String))(
      current["language_servers"] ?? ["..."]
    )

    const servers = parsed.filter((server) => !TYPESCRIPT_SERVERS.has(server.replace(/^!/, "")))
    managedLanguages[language] = Object.fromEntries([
      ...Object.entries(current),
      [
        "language_servers",
        Array.dedupe(["typescript-ls", "!vtsls", "!typescript-language-server", ...servers]),
      ],
    ])
  }

  const lsp = checkIsJsonObject(config.lsp) ? config.lsp : {}
  const legacy = checkIsJsonObject(lsp["tsgo"]) ? lsp["tsgo"] : {}
  const current = checkIsJsonObject(lsp["typescript-ls"]) ? lsp["typescript-ls"] : {}
  const server = yield* mergeConfig({ fallback: legacy, preferred: current })
  const oxlint = checkIsJsonObject(lsp["oxlint"]) ? lsp["oxlint"] : {}

  const initialization = checkIsJsonObject(oxlint["initialization_options"])
    ? oxlint["initialization_options"]
    : {}

  const settings = checkIsJsonObject(initialization["settings"]) ? initialization["settings"] : {}

  const customization = checkIsJsonObject(settings["rulesCustomization"])
    ? settings["rulesCustomization"]
    : {}

  const mergedCustomization = yield* mergeConfig({
    fallback: customization,
    preferred: rulesCustomization,
  })

  return Object.fromEntries([
    ...Object.entries(config),
    [
      "languages",
      Object.fromEntries([...Object.entries(languages), ...Object.entries(managedLanguages)]),
    ],
    [
      "lsp",
      Object.fromEntries([
        ...Object.entries(lsp).filter(([name]) => name !== "tsgo"),
        ["typescript-ls", Object.fromEntries([...Object.entries(server), ["binary", binary]])],
        [
          "oxlint",
          Object.fromEntries([
            ...Object.entries(oxlint),
            [
              "initialization_options",
              Object.fromEntries([
                ...Object.entries(initialization),
                [
                  "settings",
                  Object.fromEntries([
                    ...Object.entries(settings),
                    ["rulesCustomization", mergedCustomization],
                  ]),
                ],
              ]),
            ],
          ]),
        ],
      ]),
    ],
  ])
})

function findStaleOxfmtSettingKeys(config: Schema.JsonObject): string[] {
  const lsp = config.lsp
  const oxfmt = checkIsJsonObject(lsp) ? lsp.oxfmt : undefined
  const initializationOptions = checkIsJsonObject(oxfmt) ? oxfmt.initialization_options : undefined

  const settings = checkIsJsonObject(initializationOptions)
    ? initializationOptions.settings
    : undefined

  if (!checkIsJsonObject(settings)) {
    return []
  }

  const staleEntries: ReadonlyArray<readonly [string, Schema.Json]> =
    Object.entries(STALE_OXFMT_SETTINGS)

  return Object.entries(settings)
    .filter(([key, value]) =>
      staleEntries.some(([staleKey, staleValue]) => staleKey === key && staleValue === value)
    )
    .map(([key]) => key)
}

// The merge concatenates preset and user arrays, so managed languages dedupe their `formatter`
// arrays to keep repeated updates idempotent.
function deduplicateManagedFormatters(config: Schema.JsonObject): Schema.JsonObject {
  const languageSettings = config.languages

  if (!checkIsJsonObject(languageSettings)) {
    return config
  }

  const languages = Object.fromEntries(
    Object.entries(languageSettings).map(([language, languageConfig]) => {
      if (!(language in CONFIG.languages) || !checkIsJsonObject(languageConfig)) {
        return [language, languageConfig]
      }

      return [
        language,
        Object.fromEntries(
          Object.entries(languageConfig).map(([key, value]) => {
            if (key === "formatter" && checkIsJsonArray(value)) {
              return [key, Array.dedupe(value)]
            }

            return [key, value]
          })
        ),
      ]
    })
  )

  // Effect's JsonObject interface triggers no-misused-spread, so rebuild the plain JSON object.
  return Object.fromEntries([...Object.entries(config), ["languages", languages]])
}

function removeAstroSettings(config: Schema.JsonObject): Schema.JsonObject {
  const languages = checkIsJsonObject(config.languages) ? config.languages : {}

  return Object.fromEntries([
    ...Object.entries(config),
    [
      "languages",
      Object.fromEntries(Object.entries(languages).filter(([name]) => name !== "Astro")),
    ],
  ])
}

// Adamantite owns the command that starts Oxlint, so the update replaces it instead of merging
// the user's `binary.arguments` into it.
function setOxlintBinary(config: Schema.JsonObject): Schema.JsonObject {
  const lsp = checkIsJsonObject(config.lsp) ? config.lsp : {}
  const oxlint = checkIsJsonObject(lsp.oxlint) ? lsp.oxlint : {}

  return Object.fromEntries([
    ...Object.entries(config),
    [
      "lsp",
      Object.fromEntries([
        ...Object.entries(lsp),
        [
          "oxlint",
          Object.fromEntries([...Object.entries(oxlint), ["binary", CONFIG.lsp.oxlint.binary]]),
        ],
      ]),
    ],
  ])
}

export default defineIntegration({
  assess: ({ cwd }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)
      const content = yield* readFileIfExists(settingsPath)

      if (Option.isNone(content)) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const config = yield* parseJson(content.value, settingsPath)

      if (!checkIsJsonObject(config)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const staleKeys = findStaleOxfmtSettingKeys(config)
      const lsp = checkIsJsonObject(config.lsp) ? config.lsp : undefined
      const oxlint = checkIsJsonObject(lsp?.oxlint) ? lsp.oxlint : undefined
      const binary = oxlint?.binary
      const expected = CONFIG.lsp.oxlint.binary

      const usesEntry =
        checkIsJsonObject(binary)
        && binary.path === expected.path
        && Equal.equals(binary.arguments, expected.arguments)

      const effect = yield* readEffectEditor(cwd)
      const effectFindings: Finding[] = []

      if (Option.isSome(effect)) {
        const expectedConfig = yield* setEffectSettings(
          cwd,
          config,
          effect.value.rulesCustomization
        )

        if (!Equal.equals(config, expectedConfig)) {
          effectFindings.push({
            currentState: `\`${files[0].path}\` does not select the installed Effect language server with duplicate Oxlint Effect reports hidden.`,
            goal: [
              "Select `typescript-ls` for JavaScript, JSX, TypeScript, and TSX. Use the reference server binary and Oxlint rule customizations. Move old `lsp.tsgo` settings to `lsp.typescript-ls`, and preserve other settings and language servers.",
            ],
            id: "zed-effect-server",
            integration: "zed",
            reference: {
              content: `${yield* formatJson(yield* setEffectSettings(cwd, {}, effect.value.rulesCustomization))}\n`,
              language: "json",
            },
            title: "Zed does not use the Effect language server",
          })
        }
      }

      return {
        applicable: true,
        findings: [
          ...effectFindings,
          ...(checkHasPrettierAstro(config)
            ? [
                {
                  currentState: `\`${files[0].path}\` formats Astro files with Prettier, as Adamantite set it up before Oxfmt formatted them.`,
                  goal: [
                    "Set `languages.Astro.formatter` to the `oxfmt` language server, and set `languages.Astro.prettier.allowed` to `false`. Preserve every other setting.",
                  ],
                  id: "legacy-zed-astro-formatter",
                  integration: "zed",
                  notes: ["Oxfmt formats Astro files only for Astro 7 and later."],
                  reference: {
                    content: `${yield* formatJson({ languages: { Astro: CONFIG.languages.Astro } })}\n`,
                    language: "json",
                  },
                  title: "Zed formats Astro files with Prettier",
                } satisfies Finding,
              ]
            : []),
          ...(staleKeys.length === 0
            ? []
            : [
                {
                  currentState: `\`${files[0].path}\` contains stale oxfmt settings: ${staleKeys.map((key) => `\`${key}\``).join(", ")}.`,
                  goal: [
                    "Remove only the stale oxfmt entries that still have Adamantite's old default values.",
                    "Preserve entries that the project changed.",
                  ],
                  id: "legacy-zed-oxfmt-settings",
                  integration: "zed",
                  title: "Legacy Zed oxfmt settings",
                },
              ]),
          ...(usesEntry
            ? []
            : [
                {
                  currentState: `\`${files[0].path}\` sets \`lsp.oxlint.binary\` to ${binary === undefined ? "no value" : `\`${yield* stringifyJson(binary)}\``}. Zed does not start Oxlint through Adamantite's Oxlint entry.`,
                  goal: [
                    `Set \`lsp.oxlint.binary\` to \`${yield* stringifyJson(expected)}\` in \`${files[0].path}\`. Preserve every other setting.`,
                  ],
                  id: "zed-oxlint-entry",
                  integration: "zed",
                  reference: {
                    content: `${yield* formatJson({ lsp: { oxlint: { binary: expected } } })}\n`,
                    language: "json",
                  },
                  title: "Zed does not use the Oxlint entry",
                } satisfies Finding,
              ]),
        ],
        packageActions: [],
        warnings: [],
      } satisfies IntegrationAssessment
    }),
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)
      const effect = yield* readEffectEditor(cwd)

      const config = Option.isSome(effect)
        ? yield* setEffectSettings(cwd, CONFIG, effect.value.rulesCustomization)
        : CONFIG

      yield* ensureDirectory(path.dirname(settingsPath))
      yield* writeJsonFile(settingsPath, config)
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  files,
  kind: "editor",
  name: "zed",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)

      const zedFile = yield* readFile(settingsPath)
      const existingConfig = yield* parseJson(zedFile, settingsPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      // The project's values win, except an Astro setup that Adamantite wrote itself.
      // `setOxlintBinary` and `setEffectSettings` then set only the values that the assessment
      // checks.
      const preferred = checkHasPrettierAstro(existingConfig)
        ? removeAstroSettings(existingConfig)
        : existingConfig

      const mergedConfig = yield* mergeConfig({ fallback: CONFIG, preferred })
      const effect = yield* readEffectEditor(cwd)
      const base = setOxlintBinary(deduplicateManagedFormatters(mergedConfig))

      const newConfig = Option.isSome(effect)
        ? yield* setEffectSettings(cwd, base, effect.value.rulesCustomization)
        : base

      yield* writeFile(settingsPath, updateJsonText(zedFile, newConfig))
    }),
})
