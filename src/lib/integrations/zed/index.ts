import * as Effect from "effect/Effect"
import * as Json5 from "effect/encoding/Json5"
import * as Equal from "effect/Equal"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { readEffectEditor } from "#lib/integrations/effect-sdk.ts"
import { pluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import { EDITOR_OXLINT_ENTRY } from "#lib/integrations/oxlint/entry.ts"
import {
  EffectEditorUnavailable,
  FailedToParseFile,
  InvalidConfigFormat,
} from "#lib/shared/errors.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { checkIsJsonArray, checkIsJsonObject, formatJson, stringifyJson } from "#lib/shared/json.ts"

/**
 * The project settings of Zed.
 */
export const SETTINGS_PATH = ".zed/settings.json"

/**
 * The settings of a language that Oxfmt formats through its language server.
 */
const OXFMT_LANGUAGE = {
  format_on_save: "on",
  formatter: [{ language_server: { name: "oxfmt" } }],
  prettier: { allowed: false },
} as const

const CONFIG = {
  languages: {
    // The format preset turns on Oxfmt for each plugin language.
    ...Object.fromEntries(pluginLanguages.map(({ editors }) => [editors.zed, OXFMT_LANGUAGE])),
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
        },
      },
    },
  },
} as const

/**
 * The settings that Adamantite wrote for a plugin language before Oxfmt formatted it. Only Astro
 * had any: Zed's managed Prettier with the Astro plugin.
 */
const LEGACY_PLUGIN_LANGUAGE_SETTINGS: Partial<
  Record<(typeof pluginLanguages)[number]["editors"]["zed"], Schema.Json>
> = {
  Astro: { format_on_save: "on", prettier: { allowed: true, plugins: ["prettier-plugin-astro"] } },
}

/**
 * The plugin languages whose entry in `config` keeps the settings that Adamantite wrote before
 * Oxfmt formatted them.
 */
function findLegacyPluginLanguages(config: Schema.JsonObject) {
  const languages = checkIsJsonObject(config.languages) ? config.languages : {}

  return pluginLanguages.filter(({ editors }) => {
    const legacy = LEGACY_PLUGIN_LANGUAGE_SETTINGS[editors.zed]

    return legacy !== undefined && Equal.equals(languages[editors.zed], legacy)
  })
}

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
        reason:
          "Zed cannot find the installed Effect CLI in node_modules. Install @effect/tsgo, then run `adamantite update`.",
      })
    }

    directory = parent
  }
})

// The languages that the Effect language server checks, and the servers that Zed starts for them:
// the Effect server in place of the other TypeScript servers, then Zed's defaults.
const EFFECT_LANGUAGES = ["JavaScript", "JSX", "TypeScript", "TSX"] as const

const EFFECT_LANGUAGE_SERVERS = ["typescript-ls", "!vtsls", "!typescript-language-server", "..."]

/**
 * The command that starts the Effect language server, and the Oxlint rules that it reports, which
 * the Oxlint server hides. None when the project does not install `@effect/tsgo`.
 */
const readEffectServer = Effect.fn("readEffectServer")(function* (cwd: string) {
  const effect = yield* readEffectEditor(cwd)

  if (Option.isNone(effect)) {
    return Option.none()
  }

  const binary = {
    arguments: [yield* resolveEffectCli(cwd), "tsc", "--lsp", "--stdio"],
    path: "node",
  }

  return Option.some({ binary, rulesCustomization: effect.value.rulesCustomization })
})

/**
 * The settings that Adamantite writes, with the Effect language server when the project installs
 * `@effect/tsgo`. A project whose Effect CLI Zed cannot find gets the settings without it, and the
 * `zed-effect-server` finding.
 */
const renderSettings = Effect.fn("renderSettings")(function* (cwd: string) {
  const server = yield* readEffectServer(cwd).pipe(
    Effect.catchTag("EffectEditorUnavailable", () => Effect.succeedNone)
  )

  if (Option.isNone(server)) {
    return CONFIG
  }

  const { binary, rulesCustomization } = server.value
  const language = { language_servers: EFFECT_LANGUAGE_SERVERS }

  return {
    languages: {
      ...CONFIG.languages,
      JSX: language,
      JavaScript: { ...CONFIG.languages.JavaScript, ...language },
      TSX: { ...CONFIG.languages.TSX, ...language },
      TypeScript: { ...CONFIG.languages.TypeScript, ...language },
    },
    lsp: {
      ...CONFIG.lsp,
      oxlint: {
        ...CONFIG.lsp.oxlint,
        initialization_options: {
          settings: { ...CONFIG.lsp.oxlint.initialization_options.settings, rulesCustomization },
        },
      },
      "typescript-ls": { binary },
    },
  }
})

function readObject(value: Schema.Json | undefined): Schema.JsonObject {
  return checkIsJsonObject(value) ? value : {}
}

/**
 * The finding for kept settings that do not select the Effect language server, or that do not hide
 * the duplicate Oxlint Effect reports.
 */
const assessEffectServer = Effect.fn("assessEffectServer")(function* (
  cwd: string,
  config: Schema.JsonObject
) {
  const effect = yield* readEffectEditor(cwd)

  if (Option.isNone(effect)) {
    return []
  }

  const { rulesCustomization } = effect.value

  const cli = yield* resolveEffectCli(cwd).pipe(
    Effect.catchTag("EffectEditorUnavailable", (error) => Effect.succeed(error))
  )

  const binary = { arguments: [cli, "tsc", "--lsp", "--stdio"], path: "node" }
  const languages = readObject(config.languages)
  const lsp = readObject(config.lsp)

  const customization = readObject(
    readObject(readObject(readObject(lsp.oxlint).initialization_options).settings)
      .rulesCustomization
  )

  const selectsServer =
    !(cli instanceof EffectEditorUnavailable)
    && Equal.equals(readObject(lsp["typescript-ls"]).binary, binary)
    && EFFECT_LANGUAGES.every((language) => {
      const servers = readObject(languages[language]).language_servers

      return checkIsJsonArray(servers) && servers.includes("typescript-ls")
    })
    && Object.keys(rulesCustomization).every(
      (rule) => readObject(customization[rule]).severity === "off"
    )

  if (selectsServer) {
    return []
  }

  return [
    {
      currentState:
        cli instanceof EffectEditorUnavailable
          ? cli.message
          : `\`${SETTINGS_PATH}\` does not select the installed Effect language server with duplicate Oxlint Effect reports hidden.`,
      goal: [
        "Select `typescript-ls` for JavaScript, JSX, TypeScript, and TSX. Use the reference server binary and Oxlint rule customizations. Move old `lsp.tsgo` settings to `lsp.typescript-ls`, and preserve other settings and language servers.",
      ],
      id: "zed-effect-server",
      integration: "zed",
      reference: {
        content: `${yield* formatJson(yield* renderSettings(cwd))}\n`,
        language: "json",
      },
      title: "Zed does not use the Effect language server",
    } satisfies Finding,
  ]
})

/**
 * The findings for `.zed/settings.json`. A file that the project changed gets a finding only for a
 * change that breaks the setup: the Oxlint entry, the Effect language server, and a plugin language
 * that Prettier still formats.
 */
const assess = Effect.fn("assess")(function* (cwd: string) {
  const path = yield* Path.Path
  const settingsPath = path.join(cwd, SETTINGS_PATH)
  const content = yield* readFileIfExists(settingsPath)

  if (Option.isNone(content)) {
    return [
      {
        currentState: `The selection includes Zed, and \`${SETTINGS_PATH}\` does not exist.`,
        goal: [
          `Run \`adamantite update\`. It writes \`${SETTINGS_PATH}\`.`,
          "Run `adamantite doctor` again. It must not report this finding.",
        ],
        id: "missing-zed-settings",
        integration: "zed",
        reference: {
          content: `${yield* formatJson(yield* renderSettings(cwd))}\n`,
          language: "json",
        },
        title: "Missing Zed settings",
      } satisfies Finding,
    ]
  }

  const config = yield* Effect.fromResult(Json5.parse(content.value)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
    Effect.mapError((cause) => new FailedToParseFile({ cause, path: settingsPath }))
  )

  if (!checkIsJsonObject(config)) {
    return yield* new InvalidConfigFormat({ path: settingsPath })
  }

  const binary = readObject(readObject(config.lsp).oxlint).binary
  const expected = CONFIG.lsp.oxlint.binary

  const entry: readonly Finding[] =
    checkIsJsonObject(binary)
    && binary.path === expected.path
    && Equal.equals(binary.arguments, expected.arguments)
      ? []
      : [
          {
            currentState: `\`${SETTINGS_PATH}\` sets \`lsp.oxlint.binary\` to ${binary === undefined ? "no value" : `\`${yield* stringifyJson(binary)}\``}. Zed does not start Oxlint through Adamantite's Oxlint entry.`,
            goal: [
              `Set \`lsp.oxlint.binary\` to \`${yield* stringifyJson(expected)}\` in \`${SETTINGS_PATH}\`. Preserve every other setting.`,
            ],
            id: "zed-oxlint-entry",
            integration: "zed",
            reference: {
              content: `${yield* formatJson({ lsp: { oxlint: { binary: expected } } })}\n`,
              language: "json",
            },
            title: "Zed does not use the Oxlint entry",
          },
        ]

  const legacy = yield* Effect.forEach(
    findLegacyPluginLanguages(config),
    ({ editors: { zed }, name, option }) =>
      formatJson({ languages: { [zed]: OXFMT_LANGUAGE } }).pipe(
        Effect.map((reference): Finding => ({
          currentState: `\`${SETTINGS_PATH}\` formats ${name} files with Prettier, as Adamantite set it up before Oxfmt formatted them.`,
          goal: [
            `Set \`languages.${zed}.formatter\` to the \`oxfmt\` language server, and set \`languages.${zed}.prettier.allowed\` to \`false\`. Preserve every other setting.`,
          ],
          id: `legacy-zed-${option}-formatter`,
          integration: "zed",
          reference: { content: `${reference}\n`, language: "json" },
          title: `Zed formats ${name} files with Prettier`,
        }))
      ),
    { concurrency: 1 }
  )

  return [...(yield* assessEffectServer(cwd, config)), ...legacy, ...entry]
})

export default {
  assess: ({ cwd }: Project, _selection: Selection) =>
    Effect.map(assess(cwd), (findings) => ({ findings, packageActions: [], warnings: [] })),
  files: ({ cwd }: Project, _selection: Selection) =>
    Effect.gen(function* () {
      return [
        { content: `${yield* formatJson(yield* renderSettings(cwd))}\n`, path: SETTINGS_PATH },
      ]
    }),
  name: "zed",
  packages: (_project: Project, _selection: Selection) => [],
  prepare: (_project: Project) => Effect.void,
  selected: ({ editors }: Selection) => editors.includes("zed"),
} satisfies Integration
