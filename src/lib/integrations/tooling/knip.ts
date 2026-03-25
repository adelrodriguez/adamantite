import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineIntegration } from "#lib/integrations/base.ts"
import { FailedToWriteFile, FileNotFound } from "#lib/shared/errors.ts"
import { toKnipTsConfigContent } from "#lib/workspace/knip-config.ts"

const files = [
  { path: "knip.config.ts", type: "config" },
  { path: "knip.json", type: "legacy_config" },
  { path: "knip.jsonc", type: "legacy_config" },
] as const

const DUAL_KNIP_CONFIG_WARNING =
  "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`."

const DUAL_LEGACY_KNIP_JSON_FILES_WARNING =
  "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed."

function inspectKnipConfig(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const tsPath = path.join(cwd, files[0].path)
    const jsonPath = path.join(cwd, files[1].path)
    const jsoncPath = path.join(cwd, files[2].path)
    const hasTs = yield* fs.exists(tsPath)
    const hasJson = yield* fs.exists(jsonPath)
    const hasJsonc = yield* fs.exists(jsoncPath)

    const format: "json" | "jsonc" | "ts" | null = hasTs
      ? "ts"
      : hasJsonc
        ? "jsonc"
        : hasJson
          ? "json"
          : null

    const hasBoth = hasTs && (hasJson || hasJsonc)
    const hasBothLegacyJsonFiles = !hasTs && hasJson && hasJsonc
    const warnings = [
      ...(hasBoth ? [DUAL_KNIP_CONFIG_WARNING] : []),
      ...(hasBothLegacyJsonFiles ? [DUAL_LEGACY_KNIP_JSON_FILES_WARNING] : []),
    ]

    return {
      format,
      hasBoth,
      hasBothLegacyJsonFiles,
      jsonPath: hasJson ? jsonPath : null,
      jsoncPath: hasJsonc ? jsoncPath : null,
      path:
        format === "ts"
          ? tsPath
          : format === "jsonc"
            ? jsoncPath
            : format === "json"
              ? jsonPath
              : null,
      tsPath: hasTs ? tsPath : null,
      warnings,
    }
  })
}

export default defineIntegration({
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
  exists: inspectKnipConfig,
  files,
  kind: "tooling",
  name: "knip",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      if (!(yield* fs.exists(configPath))) {
        return yield* new FileNotFound({ path: files[0].path })
      }
    }),
  version: "6.0.4",
})
