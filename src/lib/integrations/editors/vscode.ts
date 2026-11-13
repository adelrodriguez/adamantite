import * as Effect from "effect/Effect"
import * as Json5 from "effect/encoding/Json5"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type { LintPreset } from "#lib/integrations/tooling/oxlint/presets.ts"
import type { Script } from "#lib/workspace/package-json.ts"
import type { Project } from "#lib/workspace/project.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { EFFECT_SDK_PATH, readEffectEditor } from "#lib/integrations/editors/effect.ts"
import { pluginLanguages } from "#lib/integrations/tooling/oxfmt/languages.ts"
import { EDITOR_OXLINT_ENTRY } from "#lib/integrations/tooling/oxlint/entry.ts"
import {
  FailedToInstallExtension,
  FailedToParseFile,
  InvalidConfigFormat,
  JsoncNotEditable,
  VscodeCliNotFound,
} from "#lib/shared/errors.ts"
import {
  ensureDirectory,
  readFile,
  readFileIfExists,
  writeJsonFile,
} from "#lib/shared/filesystem.ts"
import {
  checkIsJsonObject,
  checkIsPlainJson,
  formatJson,
  mergeConfig,
  stringifyJson,
} from "#lib/shared/json.ts"
import { formatInitCommand } from "#lib/workspace/init-command.ts"
import { checkRunsTool } from "#lib/workspace/package-json.ts"

const files = [{ path: ".vscode/settings.json", type: "config" }] as const

const CONFIG = {
  // The Astro and Svelte extensions set their own formatters, which take priority over the global
  // default. The format preset turns on Oxfmt for each plugin language. See ADR 0028.
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

export default defineIntegration({
  assess: ({ cwd }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)
      const content = yield* readFileIfExists(settingsPath)

      if (Option.isNone(content)) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const config = yield* Effect.fromResult(Json5.parse(content.value)).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
        Effect.mapError((cause) => new FailedToParseFile({ cause, path: settingsPath }))
      )

      if (!checkIsJsonObject(config)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const current = config["oxc.path.oxlint"]
      const expected = CONFIG["oxc.path.oxlint"]

      const findings: Finding[] =
        current === expected
          ? []
          : [
              {
                currentState: `\`${files[0].path}\` sets \`oxc.path.oxlint\` to ${current === undefined ? "no value" : `\`${yield* stringifyJson(current)}\``}. VS Code does not start Oxlint through Adamantite's Oxlint entry.`,
                goal: [
                  `Set \`oxc.path.oxlint\` to \`${expected}\` in \`${files[0].path}\`. Preserve every other setting.`,
                ],
                id: "vscode-oxlint-entry",
                integration: "vscode",
                reference: {
                  content: `${yield* formatJson({ "oxc.path.oxlint": expected })}\n`,
                  language: "json",
                },
                title: "VS Code does not use the Oxlint entry",
              },
            ]

      const effect = yield* readEffectEditor(cwd)

      if (Option.isSome(effect)) {
        const customizations = config["oxc.lint.customization"]

        const hidesDuplicates =
          checkIsJsonObject(customizations)
          && Object.keys(effect.value.rulesCustomization).every((rule) => {
            const customization = customizations[rule]

            return checkIsJsonObject(customization) && customization["severity"] === "off"
          })

        if (config["js/ts.tsdk.path"] !== EFFECT_SDK_PATH || !hidesDuplicates) {
          findings.push({
            currentState: `\`${files[0].path}\` does not select the Effect editor SDK with duplicate Oxlint Effect reports hidden.`,
            goal: [
              `Set \`js/ts.tsdk.path\` to \`${EFFECT_SDK_PATH}\` and merge the reference \`oxc.lint.customization\` entries. Preserve other settings and rule customizations.`,
            ],
            id: "vscode-effect-server",
            integration: "vscode",
            reference: {
              content: `${yield* formatJson({ "js/ts.tsdk.path": EFFECT_SDK_PATH, "oxc.lint.customization": effect.value.rulesCustomization })}\n`,
              language: "json",
            },
            title: "VS Code does not use the Effect language server",
          })
        }

        const sdkState = yield* effect.value.sdkIsCurrent.pipe(
          Effect.map((current) =>
            current
              ? undefined
              : `\`${EFFECT_SDK_PATH}\` is missing or does not match the installed Effect compiler.`
          ),
          Effect.catchTag("EffectEditorUnavailable", (error) => Effect.succeed(error.message))
        )

        if (sdkState !== undefined) {
          findings.push({
            currentState: sdkState,
            goal: [
              `Install a supported native TypeScript version and the Effect optional dependencies. Run \`${formatInitCommand({ editors: ["vscode"], scripts: ["check"] })}\` to prepare the SDK cache, then restart the TypeScript server.`,
            ],
            id: "vscode-effect-sdk",
            integration: "vscode",
            title: "The Effect editor SDK needs preparation",
          })
        }
      }

      return {
        applicable: true,
        findings,
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
        ? {
            ...CONFIG,
            "js/ts.tsdk.path": EFFECT_SDK_PATH,
            "oxc.lint.customization": effect.value.rulesCustomization,
          }
        : CONFIG

      if (Option.isSome(effect)) {
        yield* effect.value.prepareSdk
      }

      yield* ensureDirectory(path.dirname(settingsPath))
      yield* writeJsonFile(settingsPath, config)
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  extension: (scripts: Script[] = [], presets: readonly LintPreset[] = []) =>
    Effect.gen(function* () {
      const extensions: string[] = []

      if (checkRunsTool(scripts, "oxlint")) {
        extensions.push("oxc.oxc-vscode")
      }

      if (checkRunsTool(scripts, "knip")) {
        extensions.push("webpro.vscode-knip")
      }

      if (presets.includes("effect")) {
        extensions.push("TypeScriptTeam.native-preview")
      }

      for (const extension of extensions) {
        const runner = yield* CommandRunner
        yield* runner
          .run({
            args: ["--install-extension", extension],
            command: "code",
          })
          .pipe(
            Effect.mapError((cause) =>
              Predicate.isTagged(cause, "CliNotFound") && cause.command === "code"
                ? new VscodeCliNotFound({ cause })
                : new FailedToInstallExtension({
                    cause: Predicate.isTagged(cause, "CommandFailed") ? cause.exitCode : cause,
                    extension,
                  })
            )
          )
      }
    }),
  files,
  kind: "editor",
  name: "vscode",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)

      const vscodeFile = yield* readFile(settingsPath)

      const existingConfig = yield* Effect.fromResult(Json5.parse(vscodeFile)).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
        Effect.mapError((cause) => new FailedToParseFile({ cause, path: settingsPath }))
      )

      if (!checkIsJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const effect = yield* readEffectEditor(cwd)

      // The project's values win. Adamantite then sets only the values that the assessment checks.
      const merged = yield* mergeConfig({ fallback: CONFIG, preferred: existingConfig })

      const effectSettings = Option.isSome(effect)
        ? [
            ["js/ts.tsdk.path", EFFECT_SDK_PATH],
            [
              "oxc.lint.customization",
              yield* mergeConfig({
                fallback: checkIsJsonObject(existingConfig["oxc.lint.customization"])
                  ? existingConfig["oxc.lint.customization"]
                  : {},
                preferred: effect.value.rulesCustomization,
              }),
            ],
          ]
        : []

      if (Option.isSome(effect)) {
        yield* effect.value.prepareSdk
      }

      const newConfig: Schema.JsonObject = Object.fromEntries([
        ...Object.entries(merged),
        ["oxc.path.oxlint", CONFIG["oxc.path.oxlint"]],
        ...effectSettings,
      ])

      if (!checkIsPlainJson(vscodeFile)) {
        return yield* new JsoncNotEditable({
          change: "Run `adamantite doctor` for the settings to change.",
          path: settingsPath,
        })
      }

      yield* writeJsonFile(settingsPath, newConfig)
    }),
})
