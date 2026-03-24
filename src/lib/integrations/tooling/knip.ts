import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineTooling } from "#lib/integrations/tooling/base.ts"
import { FailedToWriteFile, FileNotFound } from "#lib/shared/errors.ts"
import { serializeTsObjectLiteral } from "#lib/shared/json.ts"
import preset from "#presets/analyze.ts"

export const CONFIG_FILE = "knip.config.ts"

export function toTsConfigContent(config: Record<string, unknown> = {}) {
  const configEntries = Object.entries(config).map(([key, value]) => {
    if (key === "rules" && typeof value === "object" && value !== null && !Array.isArray(value)) {
      const rulesEntries = Object.entries(value).map(
        ([ruleName, ruleValue]) =>
          `    ${ruleName}: ${serializeTsObjectLiteral(ruleValue, { indentation: "    " })},`
      )

      return ["  rules: {", "    ...analyze.rules,", ...rulesEntries, "  },"].join("\n")
    }

    return `  ${key}: ${serializeTsObjectLiteral(value)},`
  })

  if (configEntries.length === 0) {
    return [
      'import type { KnipConfig } from "knip"',
      'import analyze from "adamantite/analyze"',
      "",
      "const config: KnipConfig = analyze",
      "",
      "export default config",
      "",
    ].join("\n")
  }

  return [
    'import type { KnipConfig } from "knip"',
    'import analyze from "adamantite/analyze"',
    "",
    "const config: KnipConfig = {",
    "  ...analyze,",
    ...configEntries,
    "}",
    "",
    "export default config",
    "",
  ].join("\n")
}

export const knip = defineTooling({
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
  name: "knip",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)

      if (!(yield* fs.exists(configPath))) {
        return yield* new FileNotFound({ path: CONFIG_FILE })
      }
    }),
  version: "6.0.4",
})
