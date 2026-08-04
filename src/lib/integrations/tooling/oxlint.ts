import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import {
  defineIntegration,
  type AssessmentAction,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import {
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  UnsupportedConfigState,
} from "#lib/shared/errors.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import {
  getOxlintPresetNames,
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
} from "#lib/workspace/oxlint-config.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const files = [
  { path: "oxlint.config.ts", type: "config" },
  { path: ".oxlintrc.json", type: "legacy_config" },
] as const

const VERSION = getDependencyVersion("oxlint")

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          applicable: false,
          warnings: [],
        } satisfies IntegrationAssessment
      }

      const packageSpecifier =
        packageJson.devDependencies?.oxlint ?? packageJson.dependencies?.oxlint
      const tsPath = path.join(cwd, files[0].path)
      const jsonPath = path.join(cwd, files[1].path)
      const { hasJson, hasTs } = yield* Effect.all(
        {
          hasJson: fs.exists(jsonPath),
          hasTs: fs.exists(tsPath),
        },
        { concurrency: "unbounded" }
      )
      const state = {
        active: hasTs
          ? { format: "ts", path: tsPath }
          : hasJson
            ? { format: "json", path: jsonPath }
            : null,
        legacy: hasTs && hasJson ? [{ format: "json", path: jsonPath }] : [],
      }
      const actions: AssessmentAction[] = []
      const warnings: string[] = []
      if (state.active?.format === "ts" && state.legacy.length > 0) {
        warnings.push(
          "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`."
        )
      }

      if (!packageSpecifier) {
        actions.push({
          description: `Install \`oxlint@${VERSION}\` for the managed lint scripts.`,
          package: "oxlint",
          targetVersion: VERSION,
          type: "install_package",
        })
      } else if (normalizeDependencyVersion(packageSpecifier) !== VERSION) {
        actions.push({
          currentVersion: packageSpecifier,
          description: `Update \`oxlint\` from \`${packageSpecifier}\` to \`${VERSION}\`.`,
          package: "oxlint",
          targetVersion: VERSION,
          type: "update_package",
        })
      }

      if (state.active === null) {
        actions.push({
          description: `Create \`${files[0].path}\` for \`oxlint\`.`,
          path: files[0].path,
          type: "create_config",
        })
      }

      if (state.active?.format === "json") {
        actions.push({
          description: `Migrate legacy \`${files[1].path}\` to \`${files[0].path}\`.`,
          migrationId: "legacy-oxlint-json",
          type: "run_migration",
        })
      }

      if (state.active?.format === "ts") {
        const content = yield* fs
          .readFileString(tsPath)
          .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: tsPath })))
        const patch = inspectRequiredOxlintConfig(content)

        if (patch.kind === "patchable") {
          actions.push({
            description: "Update `oxlint.config.ts` with Adamantite's required options.",
            path: files[0].path,
            type: "update_config",
          })
        }

        if (patch.kind === "manual") {
          actions.push({
            description:
              "Manually update `oxlint.config.ts` with Adamantite's required options; Adamantite cannot patch the current file shape safely.",
            path: files[0].path,
            type: "manual_fix",
          })
        }
      }

      return {
        actions,
        applicable: true,
        warnings,
      } satisfies IntegrationAssessment
    }),
  config: files[0].path,
  create: (cwd: string, presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)
      const payload = toOxlintTsConfigContent({}, getOxlintPresetNames(presets))

      yield* fs
        .writeFileString(configPath, payload)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, files[0].path)
      const jsonPath = path.join(cwd, files[1].path)
      const { hasJson, hasTs } = yield* Effect.all(
        {
          hasJson: fs.exists(jsonPath),
          hasTs: fs.exists(tsPath),
        },
        { concurrency: "unbounded" }
      )

      const format = hasTs ? "ts" : hasJson ? "json" : null
      const legacy = []
      if (hasTs && hasJson) {
        legacy.push({ format: "json", path: jsonPath })
      }

      return {
        active:
          format === null
            ? null
            : {
                format,
                path: format === "ts" ? tsPath : jsonPath,
              },
        legacy,
      }
    }),
  files,
  kind: "tooling",
  name: "oxlint",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      if (!(yield* fs.exists(configPath))) {
        return yield* new FileNotFound({ path: files[0].path })
      }

      const content = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))
      const patch = inspectRequiredOxlintConfig(content)

      if (patch.kind === "configured") {
        return
      }

      if (patch.kind === "manual") {
        return yield* new UnsupportedConfigState({ path: files[0].path, reason: patch.reason })
      }

      yield* fs
        .writeFileString(configPath, patch.updatedContent)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  version: VERSION,
})
