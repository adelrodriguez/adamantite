import type { JsonObject } from "type-fest"
import {
  checkIsJsonObject,
  serializeTsObjectLiteral,
  serializeTsPropertyKey,
} from "#lib/shared/json.ts"
import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"

const NESTED_MERGE_KEYS = new Set(["sortImports", "sortPackageJson", "sortTailwindcss"])

export function inspectRequiredOxfmtConfig(content: string) {
  return inspectRequiredPresetConfig(content, {
    moduleName: "adamantite/format",
    presetName: "Adamantite format",
  })
}

function getSerializedObjectBody(raw: string) {
  const lines = raw.split("\n")

  if (lines.length === 1) {
    return raw.slice(1, -1).trim()
  }

  return lines
    .slice(1, -1)
    .map((line) => `    ${line.trimStart()}`)
    .join("\n")
}

function serializeNestedMergeEntry(key: string, value: JsonObject): string {
  const raw = serializeTsObjectLiteral(value)
  const body = getSerializedObjectBody(raw)

  return [`  ${key}: {`, `    ...format.${key},`, ...(body === "" ? [] : [body]), `  },`].join("\n")
}

export function toOxfmtTsConfigContent(config: JsonObject = {}) {
  const configEntries = Object.entries(config).map(([key, value]) => {
    if (NESTED_MERGE_KEYS.has(key) && checkIsJsonObject(value)) {
      return serializeNestedMergeEntry(key, value)
    }

    const serialized = serializeTsObjectLiteral(value, { continuationIndent: "  " })

    return `  ${serializeTsPropertyKey(key)}: ${serialized},`
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
