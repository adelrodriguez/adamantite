import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import {
  detectToolingWorkspace,
  type RequiredConfigInspection,
  type ToolingWorkspace,
} from "#lib/integrations/tooling/base.ts"
import { getImportedLintPresets } from "#lib/integrations/tooling/oxlint/config.ts"
import { inspectRequiredPresetConfig } from "#lib/integrations/tooling/preset-config.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

export interface KnipWorkspace extends ToolingWorkspace {
  /**
   * Whether `oxlint.config.ts` imports the `effect` preset, which names the
   * `@effect/language-service` plugin in `tsconfig.json`.
   */
  readonly usesEffectPreset: boolean
}

type IgnoreList = "effect" | "monorepo"

const DEFAULT_WORKSPACE: KnipWorkspace = { isMonorepo: false, usesEffectPreset: false }

// Bounded by the array's closing bracket, so an entry in a later property does not count. Matches
// a string or a regular expression entry, which Knip both accepts.
const ENTRY_REGEX: Record<IgnoreList, RegExp> = {
  effect: /ignoreDependencies\s*:\s*\[[^\]]*?@effect\/language-service/u,
  monorepo: /ignoreDependencies\s*:\s*\[[^\]]*?sherif/u,
}

// The preset's list, alone or spread into the array. It needs the named import: without it the
// config passes this check and then throws a ReferenceError when Knip loads it.
const PRESET_LIST_REGEX: Record<IgnoreList, RegExp> = {
  effect:
    /ignoreDependencies\s*:\s*(?:ignoreDependencies\.effect|\[[^\]]*?ignoreDependencies\.effect)/u,
  monorepo:
    /ignoreDependencies\s*:\s*(?:ignoreDependencies\.monorepo|\[[^\]]*?ignoreDependencies\.monorepo)/u,
}
const PRESET_LIST_IMPORT_REGEX =
  /import\s[^;]*?\{[^}]*\bignoreDependencies\b[^}]*\}\s*from\s*["']adamantite\/analyze["']/u

const IGNORE_REASON: Record<IgnoreList, string> = {
  effect:
    "the `effect` lint preset names the `@effect/language-service` plugin in `tsconfig.json`, and no package has that name",
  monorepo: "Knip cannot see that `adamantite analyze` runs Sherif in a monorepo",
}

function getRequiredLists(workspace: KnipWorkspace) {
  return (["monorepo", "effect"] as const).filter((list) =>
    list === "monorepo" ? workspace.isMonorepo : workspace.usesEffectPreset
  )
}

function checkIgnoresList(content: string, list: IgnoreList) {
  return (
    ENTRY_REGEX[list].test(content)
    || (PRESET_LIST_REGEX[list].test(content) && PRESET_LIST_IMPORT_REGEX.test(content))
  )
}

function formatIgnoreDependencies(lists: readonly IgnoreList[]) {
  const [only] = lists

  return lists.length === 1 && only !== undefined
    ? `ignoreDependencies.${only}`
    : `[${lists.map((list) => `...ignoreDependencies.${list}`).join(", ")}]`
}

export const detectKnipWorkspace = Effect.fn("detectKnipWorkspace")(function* (cwd: string) {
  const path = yield* Path.Path
  const lintConfig = yield* readFileIfExists(path.join(cwd, "oxlint.config.ts"))

  return {
    ...(yield* detectToolingWorkspace(cwd)),
    usesEffectPreset: Option.match(lintConfig, {
      onNone: () => false,
      onSome: (content) => getImportedLintPresets(content).includes("effect"),
    }),
  } satisfies KnipWorkspace
})

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
    moduleName: "adamantite/analyze",
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
      ? 'import analyze, { ignoreDependencies } from "adamantite/analyze"'
      : 'import analyze from "adamantite/analyze"',
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
