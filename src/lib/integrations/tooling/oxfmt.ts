import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineTooling } from "#lib/integrations/tooling/base.ts"
import { FailedToWriteFile, FileNotFound } from "#lib/shared/errors.ts"
import { isJsonObject, serializeTsObjectLiteral } from "#lib/shared/json.ts"
import preset from "#presets/format.ts"

export const CONFIG_FILE = "oxfmt.config.ts"

/** Top-level keys whose values are merged with Adamantite preset objects at runtime. */
const NESTED_MERGE_KEYS = new Set(["sortImports", "sortPackageJson", "sortTailwindcss"])

function serializeNestedMergeEntry(key: string, value: Record<string, unknown>): string {
  const raw = serializeTsObjectLiteral(value)
  const lines = raw.split("\n")

  if (lines.length <= 2) {
    return [`  ${key}: {`, `    ...format.${key},`, `  },`].join("\n")
  }

  const body = lines
    .slice(1, -1)
    .map((line) => `    ${line.trimStart()}`)
    .join("\n")

  return [`  ${key}: {`, `    ...format.${key},`, body, `  },`].join("\n")
}

export function toTsConfigContent(config: Record<string, unknown> = {}) {
  const configEntries = Object.entries(config).map(([key, value]) => {
    if (NESTED_MERGE_KEYS.has(key) && isJsonObject(value)) {
      return serializeNestedMergeEntry(key, value)
    }

    const serialized = serializeTsObjectLiteral(value, { continuationIndent: "  " })

    return `  ${key}: ${serialized},`
  })

  if (configEntries.length === 0) {
    return [
      'import { defineConfig } from "oxfmt"',
      'import format from "adamantite/format"',
      "",
      "export default defineConfig(format)",
      "",
    ].join("\n")
  }

  return [
    'import { defineConfig } from "oxfmt"',
    'import format from "adamantite/format"',
    "",
    "export default defineConfig({",
    "  ...format,",
    ...configEntries,
    "})",
    "",
  ].join("\n")
}

export const oxfmt = defineTooling({
  config: preset,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)

      yield* fs
        .writeFileString(configPath, toTsConfigContent())
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, CONFIG_FILE)
      const hasTs = yield* fs.exists(tsPath)

      return {
        format: hasTs ? "ts" : null,
        path: hasTs ? tsPath : null,
        tsPath: hasTs ? tsPath : null,
      }
    }),
  name: "oxfmt",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)

      if (!(yield* fs.exists(configPath))) {
        return yield* new FileNotFound({ path: CONFIG_FILE })
      }
    }),
  version: "0.41.0",
})
