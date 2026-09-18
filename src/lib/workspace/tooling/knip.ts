import type { JsonObject, JsonValue } from "type-fest"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
import type { RequiredConfigInspection } from "#lib/workspace/tooling/config.ts"
import {
  checkIsJsonObject,
  serializeTsObjectLiteral,
  serializeTsPropertyKey,
} from "#lib/shared/json.ts"
import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"
import { ignoreDependencies as presetIgnoreDependencies } from "#presets/analyze.ts"

const NOT_A_MONOREPO = { isMonorepo: false }

const byEntryKey = Order.mapInput(Order.String, (entry: readonly [string, string]) => entry[0])

// Bounded by the array's closing bracket, so a Sherif entry in a later property does not count.
// Matches a string or a regular expression entry, which Knip both accepts.
const SHERIF_ENTRY_REGEX = /ignoreDependencies\s*:\s*\[[^\]]*?sherif/u

// The preset's list, alone or spread into the array. It needs the named import: without it the
// config passes this check and then throws a ReferenceError when Knip loads it.
const PRESET_LIST_REGEX =
  /ignoreDependencies\s*:\s*(?:ignoreDependencies\.monorepo|\[[^\]]*?ignoreDependencies\.monorepo)/u
const PRESET_LIST_IMPORT_REGEX =
  /import\s[^;]*?\{[^}]*\bignoreDependencies\b[^}]*\}\s*from\s*["']adamantite\/analyze["']/u

function checkIgnoresSherif(content: string) {
  return (
    SHERIF_ENTRY_REGEX.test(content)
    || (PRESET_LIST_REGEX.test(content) && PRESET_LIST_IMPORT_REGEX.test(content))
  )
}

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

  return checkIgnoresSherif(content)
    ? inspection
    : {
        goal: "Set `ignoreDependencies: ignoreDependencies.monorepo` in `knip.config.ts`, with the named `ignoreDependencies` import from `adamantite/analyze`, and keep the other settings.",
        kind: "invalid",
        reason:
          "The file must set `ignoreDependencies: ignoreDependencies.monorepo` from `adamantite/analyze`, because Knip cannot see that `adamantite analyze` runs Sherif in a monorepo.",
      }
}

// The preset's default export leaves out the monorepo ignores, so the generated config adds them
// by reference and picks up later additions from the package.
function serializeIgnoreDependencies(ignoreDependencies: JsonValue | undefined) {
  const extraDependencies = (Array.isArray(ignoreDependencies) ? ignoreDependencies : []).filter(
    (dependency) =>
      !(Predicate.isString(dependency) && presetIgnoreDependencies.monorepo.includes(dependency))
  )

  return extraDependencies.length === 0
    ? "ignoreDependencies.monorepo"
    : `[...ignoreDependencies.monorepo, ${extraDependencies.map((dependency) => JSON.stringify(dependency)).join(", ")}]`
}

export function toKnipTsConfigContent(
  config: JsonObject = {},
  workspace: { readonly isMonorepo: boolean } = NOT_A_MONOREPO
) {
  const { ignoreDependencies, ...configWithoutIgnores } = config
  const entries: JsonObject = workspace.isMonorepo ? configWithoutIgnores : config
  const serializedEntries = Object.entries(entries).map(([key, value]): [string, string] => {
    if (key === "rules" && checkIsJsonObject(value)) {
      const rulesEntries = Object.entries(value).map(
        ([ruleName, ruleValue]) =>
          `    ${serializeTsPropertyKey(ruleName)}: ${serializeTsObjectLiteral(ruleValue, { continuationIndent: "    ", indentation: "    " })},`
      )

      return [key, ["  rules: {", "    ...analyze.rules,", ...rulesEntries, "  },"].join("\n")]
    }

    return [
      key,
      `  ${serializeTsPropertyKey(key)}: ${serializeTsObjectLiteral(value, { continuationIndent: "  " })},`,
    ]
  })

  if (workspace.isMonorepo) {
    serializedEntries.push([
      "ignoreDependencies",
      `  ignoreDependencies: ${serializeIgnoreDependencies(ignoreDependencies)},`,
    ])
  }

  // The lint preset turns on `sort-keys`, so the generated file must pass `adamantite check`.
  const configEntries = Array.sort(serializedEntries, byEntryKey).map(([, line]) => line)

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
    workspace.isMonorepo
      ? 'import analyze, { ignoreDependencies } from "adamantite/analyze"'
      : 'import analyze from "adamantite/analyze"',
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
