import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import {
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  UnsupportedConfigState,
} from "#lib/shared/errors.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getManagedScripts, readPackageJson } from "#lib/workspace/package-json.ts"
import {
  detectToolingConfig,
  getConfigActions,
  getPackageActions,
} from "#lib/workspace/tooling/config.ts"
import {
  getOxlintPresetNames,
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
} from "#lib/workspace/tooling/oxlint.ts"

const CONFIG_FILE = "oxlint.config.ts"
const LEGACY_CONFIG_FILE = ".oxlintrc.json"

const files = [
  { path: CONFIG_FILE, type: "config" },
  { path: LEGACY_CONFIG_FILE, type: "legacy_config" },
] as const

const configFiles = { config: CONFIG_FILE, legacyConfigs: [LEGACY_CONFIG_FILE] }

const VERSION = getDependencyVersion("oxlint")

const detect = (cwd: string) => detectToolingConfig(cwd, "oxlint", configFiles)

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          applicable: false,
          warnings: [],
        } satisfies IntegrationAssessment
      }

      const state = yield* detect(cwd)
      const actions = [
        ...getPackageActions(
          packageJson,
          { name: "oxlint", version: VERSION },
          "the managed lint scripts"
        ),
        ...getConfigActions(state, {
          configFile: CONFIG_FILE,
          migrationId: "legacy-oxlint-json",
          toolName: "oxlint",
        }),
      ]

      const activeConfig = state.active

      if (activeConfig?.format === "ts") {
        const content = yield* fs
          .readFileString(activeConfig.path)
          .pipe(
            Effect.mapError((cause) => new FailedToReadFile({ cause, path: activeConfig.path }))
          )
        const patch = inspectRequiredOxlintConfig(content)

        if (patch.kind === "patchable") {
          actions.push({
            description: "Update `oxlint.config.ts` with Adamantite's required options.",
            path: CONFIG_FILE,
            type: "update_config",
          })
        }

        if (patch.kind === "manual") {
          actions.push({
            description:
              "Manually update `oxlint.config.ts` with Adamantite's required options; Adamantite cannot patch the current file shape safely.",
            path: CONFIG_FILE,
            type: "manual_fix",
          })
        }
      }

      return {
        actions,
        applicable: true,
        warnings: state.warnings,
      } satisfies IntegrationAssessment
    }),
  config: CONFIG_FILE,
  create: (cwd: string, presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)
      const payload = toOxlintTsConfigContent({}, getOxlintPresetNames(presets))

      yield* fs
        .writeFileString(configPath, payload)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  detect,
  files,
  kind: "tooling",
  name: "oxlint",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)

      if (!(yield* fs.exists(configPath))) {
        return yield* new FileNotFound({ path: CONFIG_FILE })
      }

      const content = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))
      const patch = inspectRequiredOxlintConfig(content)

      if (patch.kind === "configured") {
        return
      }

      if (patch.kind === "manual") {
        return yield* new UnsupportedConfigState({ path: CONFIG_FILE, reason: patch.reason })
      }

      yield* fs
        .writeFileString(configPath, patch.updatedContent)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  version: VERSION,
})
