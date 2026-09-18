import type { RequiredConfigInspection } from "#lib/workspace/tooling/config.ts"
import { inspectRequiredPresetConfig } from "#lib/workspace/tooling/preset-config.ts"

const NOT_A_MONOREPO = { isMonorepo: false }

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

export function toKnipTsConfigContent(
  workspace: { readonly isMonorepo: boolean } = NOT_A_MONOREPO
) {
  return [
    'import type { KnipConfig } from "knip"',
    workspace.isMonorepo
      ? 'import analyze, { ignoreDependencies } from "adamantite/analyze"'
      : 'import analyze from "adamantite/analyze"',
    "",
    ...(workspace.isMonorepo
      ? [
          "const config: KnipConfig = {",
          "  ...analyze,",
          "  ignoreDependencies: ignoreDependencies.monorepo,",
          "}",
        ]
      : ["const config: KnipConfig = analyze"]),
    "",
    "export default config",
    "",
  ].join("\n")
}
