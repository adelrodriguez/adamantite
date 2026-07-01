import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineIntegration, type AssessmentAction } from "#lib/integrations/base.ts"
import { FailedToWriteFile } from "#lib/shared/errors.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { toOxfmtTsConfigContent } from "#lib/workspace/oxfmt-config.ts"
import {
  getManagedScripts,
  normalizeDependencyVersion,
  readPackageJson,
} from "#lib/workspace/package-json.ts"

const files = [
  { path: "oxfmt.config.ts", type: "config" },
  { path: ".oxfmtrc.json", type: "legacy_config" },
  { path: ".oxfmtrc.jsonc", type: "legacy_config" },
] as const

const VERSION = getDependencyVersion("oxfmt")

export default defineIntegration({
  assess: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("format")) {
        return {
          applicable: false,
          warnings: [],
        }
      }

      const packageSpecifier = packageJson.devDependencies?.oxfmt ?? packageJson.dependencies?.oxfmt

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
          "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`."
        )
      }
      if (!hasConfig && hasLegacyJson && hasLegacyJsonc) {
        warnings.push(
          "Found both `.oxfmtrc.json` and `.oxfmtrc.jsonc`. Multiple legacy oxfmt configs exist; Adamantite will treat `.oxfmtrc.jsonc` as the source of truth when migration is needed."
        )
      }

      if (!packageSpecifier) {
        actions.push({
          description: `Install \`oxfmt@${VERSION}\` for the managed \`format\` script.`,
          package: "oxfmt",
          targetVersion: VERSION,
          type: "install_package",
        })
      } else if (normalizeDependencyVersion(packageSpecifier) !== VERSION) {
        actions.push({
          currentVersion: packageSpecifier,
          description: `Update \`oxfmt\` from \`${packageSpecifier}\` to \`${VERSION}\`.`,
          package: "oxfmt",
          targetVersion: VERSION,
          type: "update_package",
        })
      }

      if (format === null) {
        actions.push({
          description: `Create \`${files[0].path}\` for \`oxfmt\`.`,
          path: files[0].path,
          type: "create_config",
        })
      }

      if (format === "json" || format === "jsonc") {
        actions.push({
          description: `Migrate legacy \`${format === "json" ? files[1].path : files[2].path}\` to \`${files[0].path}\`.`,
          migrationId: "legacy-oxfmt-json",
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
        .writeFileString(configPath, toOxfmtTsConfigContent())
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
  name: "oxfmt",
  version: VERSION,
})
