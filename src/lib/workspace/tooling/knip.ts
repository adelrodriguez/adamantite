import { serializeTsObjectLiteral } from "#lib/shared/json.ts"

export function toKnipTsConfigContent(config: Record<string, unknown> = {}) {
  const configEntries = Object.entries(config).map(([key, value]) => {
    if (key === "rules" && typeof value === "object" && value !== null && !Array.isArray(value)) {
      const rulesEntries = Object.entries(value).map(
        ([ruleName, ruleValue]) =>
          `    ${ruleName}: ${serializeTsObjectLiteral(ruleValue, { continuationIndent: "    ", indentation: "    " })},`
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
