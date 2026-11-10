import * as EffectRegExp from "effect/RegExp"
import type {
  RequiredConfigInspection,
  ToolingFacts,
  ToolingWorkspace,
} from "#lib/integrations/tooling/base.ts"
import { checkImportsLintPreset } from "#lib/integrations/tooling/oxlint/config.ts"
import { inspectRequiredPresetConfig } from "#lib/integrations/tooling/preset-config.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

export interface KnipWorkspace extends ToolingWorkspace {
  /**
   * Whether `oxlint.config.ts` imports the `effect` preset, which names the
   * `@effect/language-service` plugin in `tsconfig.json`.
   */
  readonly usesEffectPreset: boolean
}

/**
 * The `ignoreDependencies` lists of `adamantite/analyze`, in the order that a generated config
 * spreads them.
 */
const IGNORE_LISTS = ["monorepo", "effect"] as const

type IgnoreList = (typeof IGNORE_LISTS)[number]

/**
 * The entries of each list. A test keeps them equal to `ignoreDependencies` in
 * `presets/analyze.ts`.
 */
export const IGNORED_ENTRIES = {
  effect: ["@effect/language-service"],
  monorepo: ["sherif"],
} as const satisfies Record<IgnoreList, readonly string[]>

const IS_REQUIRED = {
  effect: (workspace) => workspace.usesEffectPreset,
  monorepo: (workspace) => workspace.isMonorepo,
} as const satisfies Record<IgnoreList, (workspace: KnipWorkspace) => boolean>

const IGNORE_REASON = {
  effect:
    "the `effect` lint preset names the `@effect/language-service` plugin in `tsconfig.json`, and no package has that name",
  monorepo: "Knip cannot see that `adamantite analyze` runs Sherif in a monorepo",
} as const satisfies Record<IgnoreList, string>

const DEFAULT_WORKSPACE: KnipWorkspace = { isMonorepo: false, usesEffectPreset: false }

// Bounded by the array's closing bracket, so an entry in a later property does not count. Matches
// a string or a regular expression entry, which Knip both accepts.
function checkListsEntry(content: string, entry: string) {
  return new RegExp(
    String.raw`ignoreDependencies\s*:\s*\[[^\]]*?${EffectRegExp.escape(entry)}`,
    "u"
  ).test(content)
}

// The preset's list, alone or spread into the array. It needs the named import: without it the
// config passes this check and then throws a ReferenceError when Knip loads it.
function checkUsesPresetList(content: string, list: IgnoreList) {
  return new RegExp(
    String.raw`ignoreDependencies\s*:\s*(?:ignoreDependencies\.${list}|\[[^\]]*?ignoreDependencies\.${list})`,
    "u"
  ).test(content)
}

const PRESET_LIST_IMPORT_REGEX =
  /import\s[^;]*?\{[^}]*\bignoreDependencies\b[^}]*\}\s*from\s*["']adamantite\/analyze["']/u

function getRequiredLists(workspace: KnipWorkspace) {
  return IGNORE_LISTS.filter((list) => IS_REQUIRED[list](workspace))
}

function checkIgnoresList(content: string, list: IgnoreList) {
  return (
    IGNORED_ENTRIES[list].every((entry) => checkListsEntry(content, entry))
    || (checkUsesPresetList(content, list) && PRESET_LIST_IMPORT_REGEX.test(content))
  )
}

function formatIgnoreDependencies(lists: readonly IgnoreList[]) {
  const [only] = lists

  return lists.length === 1 && only !== undefined
    ? `ignoreDependencies.${only}`
    : `[${lists.map((list) => `...ignoreDependencies.${list}`).join(", ")}]`
}

export function toKnipWorkspace({ isMonorepo, lintConfig }: ToolingFacts): KnipWorkspace {
  return {
    isMonorepo,
    usesEffectPreset: checkImportsLintPreset(lintConfig, "effect"),
  }
}

/**
 * In a monorepo the config must also ignore Sherif: `adamantite analyze` runs it, and Knip has no
 * plugin that sees that reference, so it reports Sherif as an unused devDependency. With the
 * `effect` lint preset it must ignore the `@effect/language-service` plugin name.
 */
export function inspectRequiredKnipConfig(
  content: string,
  workspace: KnipWorkspace
): RequiredConfigInspection {
  const inspection = inspectRequiredPresetConfig(content, {
    moduleName: publicImport("./analyze"),
    presetName: "Adamantite analyze",
  })

  if (inspection.kind !== "configured") {
    return inspection
  }

  const requiredLists = getRequiredLists(workspace)
  const missingLists = requiredLists.filter((list) => !checkIgnoresList(content, list))

  if (missingLists.length === 0) {
    return inspection
  }

  const setting = `\`ignoreDependencies: ${formatIgnoreDependencies(requiredLists)}\``

  return {
    goal: `Set ${setting} in \`knip.config.ts\`, with the named \`ignoreDependencies\` import from \`adamantite/analyze\`, and keep the other settings.`,
    kind: "invalid",
    reason: `The file must set ${setting} from \`adamantite/analyze\`, because ${missingLists.map((list) => IGNORE_REASON[list]).join(", and ")}.`,
  }
}

export function toKnipTsConfigContent(workspace: KnipWorkspace = DEFAULT_WORKSPACE) {
  const lists = getRequiredLists(workspace)

  return [
    'import type { KnipConfig } from "knip"',
    lists.length > 0
      ? `import analyze, { ignoreDependencies } from "${publicImport("./analyze")}"`
      : `import analyze from "${publicImport("./analyze")}"`,
    "",
    ...(lists.length > 0
      ? [
          "const config: KnipConfig = {",
          "  ...analyze,",
          `  ignoreDependencies: ${formatIgnoreDependencies(lists)},`,
          "}",
        ]
      : ["const config: KnipConfig = analyze"]),
    "",
    "export default config",
    "",
  ].join("\n")
}
