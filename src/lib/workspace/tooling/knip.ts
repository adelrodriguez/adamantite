import type { JsonObject } from "type-fest"
import type { RequiredConfigInspection } from "#lib/workspace/tooling/config.ts"
import {
  checkIsJsonObject,
  serializeTsObjectLiteral,
  serializeTsPropertyKey,
} from "#lib/shared/json.ts"
import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"

// Bounded by the array's closing bracket, so a Sherif entry in a later property does not count.
// Matches a string or a regular expression entry, which Knip both accepts.
const SHERIF_IGNORE_REGEX = /ignoreDependencies\s*:\s*\[[^\]]*?sherif/u

/**
 * In a monorepo the config must also ignore Sherif: `adamantite analyze` runs it, and Knip has no
 * plugin that sees that reference, so it reports Sherif as an unused devDependency.
 */
export function inspectRequiredKnipConfig(
  content: string,
  workspace: { readonly isMonorepo: boolean }
): RequiredConfigInspection {
  const inspection = inspectRequiredPresetConfig(content, {
    moduleName: "adamantite/analyze",
    presetName: "Adamantite analyze",
  })

  if (inspection.kind !== "configured" || !workspace.isMonorepo) {
    return inspection
  }

  return SHERIF_IGNORE_REGEX.test(content)
    ? inspection
    : {
        goal: 'Add `"sherif"` to `ignoreDependencies` in `knip.config.ts` and keep the other settings.',
        kind: "invalid",
        reason:
          'The file must set `ignoreDependencies: ["sherif"]`, because Knip cannot see that `adamantite analyze` runs Sherif in a monorepo.',
      }
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

    return `  ${serializeTsPropertyKey(key)}: ${serializeTsObjectLiteral(value, { continuationIndent: "  " })},`
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
