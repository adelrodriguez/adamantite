import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineIntegration, type AssessmentAction } from "#lib/integrations/base.ts"
import { FailedToWriteFile } from "#lib/shared/errors.ts"
import { toKnipTsConfigContent } from "#lib/workspace/knip-config.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const files = [
  { path: "knip.config.ts", type: "config" },
  { path: "knip.json", type: "legacy_config" },
  { path: "knip.jsonc", type: "legacy_config" },
] as const

const VERSION = "6.23.0"

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("analyze")) {
        return {
          applicable: false,
          warnings: [],
        }
      }

      const packageSpecifier = packageJson.devDependencies?.knip ?? packageJson.dependencies?.knip

      const configPath = path.join(cwd, files[0].path)
      const legacyJsonPath = path.join(cwd, files[1].path)
      const legacyJsoncPath = path.join(cwd, files[2].path)
      const hasConfig = yield* fs.exists(configPath)
      const hasLegacyJson = yield* fs.exists(legacyJsonPath)
      const hasLegacyJsonc = yield* fs.exists(legacyJsoncPath)
      const format = hasConfig ? "ts" : hasLegacyJsonc ? "jsonc" : hasLegacyJson ? "json" : null
      const actions: AssessmentAction[] = []
      const warnings: string[] = []
      if (hasConfig && (hasLegacyJson || hasLegacyJsonc)) {
        warnings.push(
          "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`."
        )
      }
      if (!hasConfig && hasLegacyJson && hasLegacyJsonc) {
        warnings.push(
          "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed."
        )
      }

      if (!packageSpecifier) {
        actions.push({
          description: `Install \`knip@${VERSION}\` for the managed \`analyze\` script.`,
          package: "knip",
          targetVersion: VERSION,
          type: "install_package",
        })
      } else if (normalizeDependencyVersion(packageSpecifier) !== VERSION) {
        actions.push({
          currentVersion: packageSpecifier,
          description: `Update \`knip\` from \`${packageSpecifier}\` to \`${VERSION}\`.`,
          package: "knip",
          targetVersion: VERSION,
          type: "update_package",
        })
      }

      if (format === null) {
        actions.push({
          description: `Create \`${files[0].path}\` for \`knip\`.`,
          path: files[0].path,
          type: "create_config",
        })
      }

      if (format === "json" || format === "jsonc") {
        actions.push({
          description: `Migrate legacy \`${format === "json" ? files[1].path : files[2].path}\` to \`${files[0].path}\`.`,
          migrationId: "legacy-knip-json",
          type: "run_migration",
        })
      }

      return {
        actions,
        applicable: true,
        warnings,
      }
    }),
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      yield* fs
        .writeFileString(configPath, toKnipTsConfigContent())
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, files[0].path)
      const jsonPath = path.join(cwd, files[1].path)
      const jsoncPath = path.join(cwd, files[2].path)
      const hasTs = yield* fs.exists(tsPath)
      const hasJson = yield* fs.exists(jsonPath)
      const hasJsonc = yield* fs.exists(jsoncPath)

      const format = hasTs ? "ts" : hasJsonc ? "jsonc" : hasJson ? "json" : null
      const legacy = []
      if (hasTs && hasJson) {
        legacy.push({ format: "json", path: jsonPath })
      }
      if (hasTs && hasJsonc) {
        legacy.push({ format: "jsonc", path: jsoncPath })
      }
      if (!hasTs && hasJson && hasJsonc) {
        legacy.push({ format: "json", path: jsonPath })
      }

      return {
        active:
          format === null
            ? null
            : {
                format,
                path: format === "ts" ? tsPath : format === "jsonc" ? jsoncPath : jsonPath,
              },
        legacy,
      }
    }),
  files,
  kind: "tooling",
  name: "knip",
  version: VERSION,
})
