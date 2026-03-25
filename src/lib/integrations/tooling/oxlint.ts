import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineIntegration, type AssessmentAction } from "#lib/integrations/base.ts"
import { FailedToWriteFile, FileNotFound } from "#lib/shared/errors.ts"
import { getOxlintPresetNames, toOxlintTsConfigContent } from "#lib/workspace/oxlint-config.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const files = [
  { path: "oxlint.config.ts", type: "config" },
  { path: ".oxlintrc.json", type: "legacy_config" },
] as const

const VERSION = "1.56.0"

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          actions: [],
          status: "not_applicable",
          warnings: [],
        }
      }

      const packageSpecifier =
        packageJson.devDependencies?.oxlint ?? packageJson.dependencies?.oxlint
      const tsPath = path.join(cwd, files[0].path)
      const jsonPath = path.join(cwd, files[1].path)
      const hasTs = yield* fs.exists(tsPath)
      const hasJson = yield* fs.exists(jsonPath)
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

      return {
        actions,
        status: actions.length === 0 ? "healthy" : "needs_action",
        warnings,
      }
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
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, files[0].path)
      const jsonPath = path.join(cwd, files[1].path)
      const hasTs = yield* fs.exists(tsPath)
      const hasJson = yield* fs.exists(jsonPath)

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
  update: (cwd: string, _presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, files[0].path)
      const hasTs = yield* fs.exists(tsPath)

      if (hasTs) {
        return
      }

      return yield* new FileNotFound({ path: files[0].path })
    }),
  version: VERSION,
})
