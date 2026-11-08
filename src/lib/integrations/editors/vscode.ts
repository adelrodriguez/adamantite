import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { Script } from "#lib/workspace/package-json.ts"
import type { Project } from "#lib/workspace/project.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { EFFECT_SDK_PATH, readEffectEditor } from "#lib/integrations/editors/effect.ts"
import {
  FailedToInstallExtension,
  InvalidConfigFormat,
  VscodeCliNotFound,
} from "#lib/shared/errors.ts"
import {
  ensureDirectory,
  readFile,
  readFileIfExists,
  writeFile,
  writeJsonFile,
} from "#lib/shared/filesystem.ts"
import {
  checkIsJsonObject,
  formatJson,
  mergeConfig,
  parseJson,
  stringifyJson,
  updateJsonText,
} from "#lib/shared/json.ts"

const files = [{ path: ".vscode/settings.json", type: "config" }] as const

const CONFIG = {
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
  "oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js",
  "oxc.typeAware": true,
} as const

export default defineIntegration({
  assess: ({ cwd }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)
      const content = yield* readFileIfExists(settingsPath)

      if (content._tag === "None") {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const config = yield* parseJson(content.value, settingsPath)

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
              "Install a supported native TypeScript version and the Effect optional dependencies. Run `adamantite init --non-interactive --script check --editor vscode` to prepare the SDK cache, then restart the TypeScript server.",
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
  extension: (scripts: Script[] = [], presets: readonly string[] = []) =>
    Effect.gen(function* () {
      const extensions: string[] = []

      if (scripts.includes("check") || scripts.includes("fix")) {
        extensions.push("oxc.oxc-vscode")
      }

      if (scripts.includes("analyze")) {
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
              cause._tag === "CliNotFound" && cause.command === "code"
                ? new VscodeCliNotFound({ cause })
                : new FailedToInstallExtension({
                    cause: cause._tag === "CommandFailed" ? cause.exitCode : cause,
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
      const existingConfig = yield* parseJson(vscodeFile, settingsPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const effect = yield* readEffectEditor(cwd)

      const base = Option.isSome(effect)
        ? {
            ...CONFIG,
            "js/ts.tsdk.path": EFFECT_SDK_PATH,
            "oxc.lint.customization": effect.value.rulesCustomization,
          }
        : CONFIG

      if (Option.isSome(effect)) {
        yield* effect.value.prepareSdk
      }

      const newConfig = yield* mergeConfig(base, existingConfig)

      yield* writeFile(settingsPath, updateJsonText(vscodeFile, newConfig))
    }),
})
