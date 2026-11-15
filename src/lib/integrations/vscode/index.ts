import * as Effect from "effect/Effect"
import * as Json5 from "effect/encoding/Json5"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import type { Integration, ToolingPackage } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { EFFECT_SDK_PATH, readEffectEditor } from "#lib/integrations/editors/effect.ts"
import { pluginLanguages } from "#lib/integrations/oxfmt/languages.ts"
import { EDITOR_OXLINT_ENTRY } from "#lib/integrations/tooling/oxlint/entry.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { FailedToParseFile, InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { checkIsJsonObject, formatJson, stringifyJson } from "#lib/shared/json.ts"

/**
 * The settings that VS Code and the editors built on it read, such as Cursor and Windsurf.
 */
export const SETTINGS_PATH = ".vscode/settings.json"

const EXTENSIONS_PATH = ".vscode/extensions.json"

const SETTINGS = {
  // The Astro and Svelte extensions set their own formatters, which take priority over the global
  // default. The format preset turns on Oxfmt for each plugin language.
  ...Object.fromEntries(
    pluginLanguages.map(({ editors }) => [
      `[${editors.vscode}]`,
      { "editor.defaultFormatter": "oxc.oxc-vscode" },
    ])
  ),
  "[css]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[graphql]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[javascript]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[json]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[jsonc]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[typescript]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "oxc.oxc-vscode",
  },
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "explicit",
  },
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.formatOnPaste": true,
  "editor.formatOnSave": true,
  // The entry runs Oxlint with the project's Oxlint runtime. The Oxc extension resolves a relative path
  // against the first workspace folder, and it expands no `${workspaceFolder}`. It starts a `.js`
  // path with Node.js, without a working directory in the project, so the entry finds the project
  // from its own path.
  "oxc.path.oxlint": EDITOR_OXLINT_ENTRY,
  "oxc.typeAware": true,
} as const

/**
 * The extension that each part of the selection needs, in the order that `.vscode/extensions.json`
 * lists them.
 */
const EXTENSIONS = [
  { id: "oxc.oxc-vscode", selected: ({ scripts }) => checkRunsTool(scripts, "oxlint") },
  { id: "webpro.vscode-knip", selected: ({ scripts }) => checkRunsTool(scripts, "knip") },
  // The Effect language server runs on the native TypeScript preview.
  {
    id: "TypeScriptTeam.native-preview",
    selected: ({ presets }) => presets.includes("effect"),
  },
] as const satisfies ReadonlyArray<{
  readonly id: string
  readonly selected: (selection: Selection) => boolean
}>

function listRecommendations(selection: Selection): readonly string[] {
  return EXTENSIONS.flatMap((extension) => (extension.selected(selection) ? [extension.id] : []))
}

const Extensions = Schema.Struct({ recommendations: Schema.optional(Schema.Array(Schema.String)) })

/**
 * Reads a VS Code JSON file of the project. None when the file does not exist. VS Code accepts
 * comments and trailing commas, which the JSON5 parser reads and the JSONC parser rejects.
 */
const readConfig = Effect.fn("readConfig")(function* (cwd: string, file: string) {
  const path = yield* Path.Path
  const target = path.join(cwd, file)
  const content = yield* readFileIfExists(target)

  if (Option.isNone(content)) {
    return Option.none<Schema.Json>()
  }

  return Option.some(
    yield* Effect.fromResult(Json5.parse(content.value)).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
      Effect.mapError((cause) => new FailedToParseFile({ cause, path: target }))
    )
  )
})

/**
 * The settings with the Effect language server when the project installs `@effect/tsgo`.
 */
const renderSettings = Effect.fn("renderSettings")(function* (cwd: string) {
  const effect = yield* readEffectEditor(cwd)

  return Option.match(effect, {
    onNone: () => SETTINGS,
    onSome: ({ rulesCustomization }) => ({
      ...SETTINGS,
      "js/ts.tsdk.path": EFFECT_SDK_PATH,
      "oxc.lint.customization": rulesCustomization,
    }),
  })
})

const missingFileFinding = (file: string, id: string, title: string, reference: string) => ({
  currentState: `The selection includes VS Code, and \`${file}\` does not exist.`,
  goal: [
    `Run \`adamantite update\`. It writes \`${file}\`.`,
    "Run `adamantite doctor` again. It must not report this finding.",
  ],
  id,
  integration: "vscode",
  reference: { content: reference, language: "json" as const },
  title,
})

/**
 * The findings for `.vscode/settings.json`: the Oxlint entry, and the Effect language server when
 * the project installs `@effect/tsgo`.
 */
const assessSettings = Effect.fn("assessSettings")(function* (cwd: string) {
  const path = yield* Path.Path
  const settings = yield* readConfig(cwd, SETTINGS_PATH)

  if (Option.isNone(settings)) {
    return [
      missingFileFinding(
        SETTINGS_PATH,
        "missing-vscode-settings",
        "Missing VS Code settings",
        `${yield* formatJson(yield* renderSettings(cwd))}\n`
      ),
    ]
  }

  const config = settings.value

  if (!checkIsJsonObject(config)) {
    return yield* new InvalidConfigFormat({ path: path.join(cwd, SETTINGS_PATH) })
  }

  const current = config["oxc.path.oxlint"]
  const expected = SETTINGS["oxc.path.oxlint"]

  const entry =
    current === expected
      ? []
      : [
          {
            currentState: `\`${SETTINGS_PATH}\` sets \`oxc.path.oxlint\` to ${current === undefined ? "no value" : `\`${yield* stringifyJson(current)}\``}. VS Code does not start Oxlint through Adamantite's Oxlint entry.`,
            goal: [
              `Set \`oxc.path.oxlint\` to \`${expected}\` in \`${SETTINGS_PATH}\`. Preserve every other setting.`,
            ],
            id: "vscode-oxlint-entry",
            integration: "vscode",
            reference: {
              content: `${yield* formatJson({ "oxc.path.oxlint": expected })}\n`,
              language: "json" as const,
            },
            title: "VS Code does not use the Oxlint entry",
          },
        ]

  const effect = yield* readEffectEditor(cwd)

  if (Option.isNone(effect)) {
    return entry
  }

  const { rulesCustomization, sdkIsCurrent } = effect.value
  const customizations = config["oxc.lint.customization"]

  const hidesDuplicates =
    checkIsJsonObject(customizations)
    && Object.keys(rulesCustomization).every((rule) => {
      const customization = customizations[rule]

      return checkIsJsonObject(customization) && customization["severity"] === "off"
    })

  const server =
    config["js/ts.tsdk.path"] === EFFECT_SDK_PATH && hidesDuplicates
      ? []
      : [
          {
            currentState: `\`${SETTINGS_PATH}\` does not select the Effect editor SDK with duplicate Oxlint Effect reports hidden.`,
            goal: [
              `Set \`js/ts.tsdk.path\` to \`${EFFECT_SDK_PATH}\` and merge the reference \`oxc.lint.customization\` entries. Preserve other settings and rule customizations.`,
            ],
            id: "vscode-effect-server",
            integration: "vscode",
            reference: {
              content: `${yield* formatJson({ "js/ts.tsdk.path": EFFECT_SDK_PATH, "oxc.lint.customization": rulesCustomization })}\n`,
              language: "json" as const,
            },
            title: "VS Code does not use the Effect language server",
          },
        ]

  const sdkState = yield* sdkIsCurrent.pipe(
    Effect.map((isCurrent) =>
      isCurrent
        ? Option.none<string>()
        : Option.some(
            `\`${EFFECT_SDK_PATH}\` is missing or does not match the installed Effect compiler.`
          )
    ),
    Effect.catchTag("EffectEditorUnavailable", (error) => Effect.succeedSome(error.message))
  )

  const sdk = Option.match(sdkState, {
    onNone: () => [],
    onSome: (currentState) => [
      {
        currentState,
        goal: [
          "Install a supported native TypeScript version and the Effect optional dependencies. Run `adamantite update` to prepare the SDK cache, then restart the TypeScript server.",
        ],
        id: "vscode-effect-sdk",
        integration: "vscode",
        title: "The Effect editor SDK needs preparation",
      },
    ],
  })

  return [...entry, ...server, ...sdk]
})

/**
 * The finding for `.vscode/extensions.json` when it does not recommend an extension that the
 * selection needs. VS Code compares extension IDs without case.
 */
const assessExtensions = Effect.fn("assessExtensions")(function* (
  cwd: string,
  selection: Selection
) {
  const path = yield* Path.Path
  const expected = listRecommendations(selection)

  if (expected.length === 0) {
    return []
  }

  const content = yield* readConfig(cwd, EXTENSIONS_PATH)

  if (Option.isNone(content)) {
    return [
      missingFileFinding(
        EXTENSIONS_PATH,
        "missing-vscode-extensions",
        "Missing VS Code extension recommendations",
        `${yield* formatJson({ recommendations: expected })}\n`
      ),
    ]
  }

  const { recommendations = [] } = yield* Schema.decodeUnknownEffect(Extensions)(
    content.value
  ).pipe(Effect.mapError(() => new InvalidConfigFormat({ path: path.join(cwd, EXTENSIONS_PATH) })))

  const recommended = new Set(recommendations.map((id) => id.toLowerCase()))
  const missing = expected.filter((id) => !recommended.has(id.toLowerCase()))

  return missing.length === 0
    ? []
    : [
        {
          currentState: `\`${EXTENSIONS_PATH}\` does not recommend ${missing.map((id) => `\`${id}\``).join(", ")}.`,
          goal: [
            `Add ${missing.map((id) => `\`${id}\``).join(", ")} to \`recommendations\` in \`${EXTENSIONS_PATH}\`. Keep the other entries.`,
          ],
          id: "vscode-extension-recommendations",
          integration: "vscode",
          title: "VS Code does not recommend the extensions of the setup",
        },
      ]
})

export default {
  assess: ({ cwd }: Project, selection: Selection) =>
    Effect.all([assessSettings(cwd), assessExtensions(cwd, selection)], {
      concurrency: "unbounded",
    }).pipe(
      Effect.map(([settings, extensions]) => ({
        findings: [...settings, ...extensions],
        packageActions: [],
        warnings: [],
      }))
    ),
  files: ({ cwd }: Project, selection: Selection) =>
    Effect.gen(function* () {
      const recommendations = listRecommendations(selection)

      return [
        {
          content: `${yield* formatJson(yield* renderSettings(cwd))}\n`,
          path: SETTINGS_PATH,
        },
        ...(recommendations.length === 0
          ? []
          : [
              {
                content: `${yield* formatJson({ recommendations })}\n`,
                path: EXTENSIONS_PATH,
              },
            ]),
      ]
    }),
  name: "vscode",
  packages: (_project: Project, _selection: Selection): readonly ToolingPackage[] => [],
  // A project without a matching Effect build gets the `vscode-effect-sdk` finding instead.
  prepare: ({ cwd }: Project) =>
    readEffectEditor(cwd).pipe(
      Effect.flatMap((effect) =>
        Option.match(effect, {
          onNone: () => Effect.void,
          onSome: ({ prepareSdk }) =>
            prepareSdk.pipe(Effect.catchTag("EffectEditorUnavailable", () => Effect.void)),
        })
      )
    ),
  selected: (selection: Selection) => selection.editors.includes("vscode"),
} satisfies Integration
