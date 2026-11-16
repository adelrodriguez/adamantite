import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import type { RequiredConfigInspection } from "#lib/integrations/tooling/base.ts"
import type * as Project from "#lib/project/index.ts"
import type { Selection } from "#lib/project/selection.ts"
import { IDENTITY_KEY, PresetIdentity } from "#lib/project/config-loader.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { ignoreDependencies } from "#presets/analyze.ts"

const ANALYZE_PRESET_MODULE = publicImport("./analyze")

interface KnipWorkspace {
  readonly isMonorepo: boolean
  /**
   * Whether the selection includes the `effect` preset, which names the `@effect/language-service`
   * plugin in `tsconfig.json`.
   */
  readonly usesEffectPreset: boolean
}

/**
 * The `ignoreDependencies` lists of `adamantite/analyze`, in the order that a generated config
 * spreads them.
 */
const IGNORE_LISTS = ["monorepo", "effect"] as const satisfies ReadonlyArray<
  keyof typeof ignoreDependencies
>

type IgnoreList = (typeof IGNORE_LISTS)[number]

const IS_REQUIRED = {
  effect: (workspace) => workspace.usesEffectPreset,
  monorepo: (workspace) => workspace.isMonorepo,
} as const satisfies Record<IgnoreList, (workspace: KnipWorkspace) => boolean>

const IGNORE_REASON = {
  effect:
    "the `effect` lint preset names the `@effect/language-service` plugin in `tsconfig.json`, and no package has that name",
  monorepo: "Knip cannot see that `adamantite analyze` runs Sherif in a monorepo",
} as const satisfies Record<IgnoreList, string>

function getRequiredLists(workspace: KnipWorkspace) {
  return IGNORE_LISTS.filter((list) => IS_REQUIRED[list](workspace))
}

/**
 * What Adamantite reads from a loaded `knip.config.ts`: the preset that it applies, and its
 * `ignoreDependencies`, where Knip accepts a name or a regular expression.
 */
export const KnipConfig = Schema.Struct({
  [IDENTITY_KEY]: Schema.optional(PresetIdentity),
  ignoreDependencies: Schema.optional(
    Schema.Array(
      Schema.Union([Schema.String, Schema.Struct({ $regexp: Schema.String, flags: Schema.String })])
    )
  ),
})

export type KnipConfig = typeof KnipConfig.Type

function checkIgnoresList(config: KnipConfig, list: IgnoreList) {
  return ignoreDependencies[list].every((entry) =>
    (config.ignoreDependencies ?? []).some((ignored) =>
      Predicate.isString(ignored)
        ? ignored === entry
        : new RegExp(ignored.$regexp, ignored.flags).test(entry)
    )
  )
}

function formatIgnoreDependencies(lists: readonly IgnoreList[]) {
  const [only] = lists

  return lists.length === 1 && only !== undefined
    ? `ignoreDependencies.${only}`
    : `[${lists.map((list) => `...ignoreDependencies.${list}`).join(", ")}]`
}

export function toKnipWorkspace(
  { workspace }: Project.Snapshot,
  { presets }: Selection
): KnipWorkspace {
  return {
    isMonorepo: workspace.isMonorepo,
    usesEffectPreset: presets.includes("effect"),
  }
}

/**
 * In a monorepo the config must also ignore Sherif: `adamantite analyze` runs it, and Knip has no
 * plugin that sees that reference, so it reports Sherif as an unused devDependency. With the
 * `effect` lint preset it must ignore the `@effect/language-service` plugin name.
 */
export function inspectRequiredKnipConfig(
  config: KnipConfig,
  workspace: KnipWorkspace
): RequiredConfigInspection {
  if (config[IDENTITY_KEY]?.module !== ANALYZE_PRESET_MODULE) {
    return {
      goal: `Spread the Adamantite analyze preset from \`${ANALYZE_PRESET_MODULE}\` into the exported config, or export it alone. Preserve every project-specific setting.`,
      kind: "invalid",
      reason: `The exported config does not apply the Adamantite analyze preset from \`${ANALYZE_PRESET_MODULE}\`.`,
    }
  }

  const requiredLists = getRequiredLists(workspace)
  const missingLists = requiredLists.filter((list) => !checkIgnoresList(config, list))

  if (missingLists.length === 0) {
    return { kind: "configured" }
  }

  const setting = `\`ignoreDependencies: ${formatIgnoreDependencies(requiredLists)}\``

  return {
    goal: `Set ${setting} in \`knip.config.ts\`, with the named \`ignoreDependencies\` import from \`adamantite/analyze\`, and keep the other settings.`,
    kind: "invalid",
    reason: `The file must set ${setting} from \`adamantite/analyze\`, because ${missingLists.map((list) => IGNORE_REASON[list]).join(", and ")}.`,
  }
}

const DEFAULT_WORKSPACE: KnipWorkspace = { isMonorepo: false, usesEffectPreset: false }

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
