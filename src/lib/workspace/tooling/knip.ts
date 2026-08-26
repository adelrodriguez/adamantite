import type { JsonObject } from "type-fest"
import {
  checkIsJsonObject,
  serializeTsObjectLiteral,
  serializeTsPropertyKey,
} from "#lib/shared/json.ts"
import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"

export function inspectRequiredKnipConfig(content: string) {
  return inspectRequiredPresetConfig(content, {
    moduleName: "adamantite/analyze",
    presetName: "Adamantite analyze",
  })
}

export function toKnipTsConfigContent(config: JsonObject = {}) {
  const configEntries = Object.entries(config).map(([key, value]) => {
    if (key === "rules" && checkIsJsonObject(value)) {
      const rulesEntries = Object.entries(value).map(
        ([ruleName, ruleValue]) =>
          `    ${serializeTsPropertyKey(ruleName)}: ${serializeTsObjectLiteral(ruleValue, { continuationIndent: "    ", indentation: "    " })},`
      )

      return ["  rules: {", "    ...analyze.rules,", ...rulesEntries, "  },"].join("\n")
    }

    return `  ${serializeTsPropertyKey(key)}: ${serializeTsObjectLiteral(value)},`
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
