import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import {
  IDENTITY_KEY,
  PresetIdentity,
  readConfig,
  RulesFolderIdentity,
} from "#lib/project/config-loader.ts"

/**
 * The setting of `no-restricted-imports` under each name that Oxlint accepts for the rule. The
 * value stays unknown, so an option that Adamantite does not read never fails the decode of a
 * config that Oxlint loads.
 */
const RESTRICTED_IMPORTS_FIELDS = {
  "eslint/no-restricted-imports": Schema.optional(Schema.Unknown),
  "no-restricted-imports": Schema.optional(Schema.Unknown),
  "typescript/no-restricted-imports": Schema.optional(Schema.Unknown),
}

/**
 * An entry of `overrides` in a loaded Oxlint config. An entry that spreads a preset names the
 * preset itself, and an entry that spreads the `rules` of a preset, as the documentation comment of
 * the jest and vitest presets shows, names it in `rules`.
 */
const OverrideObject = Schema.Struct({
  [IDENTITY_KEY]: Schema.optional(PresetIdentity),
  rules: Schema.optional(
    Schema.Struct({
      [IDENTITY_KEY]: Schema.optional(PresetIdentity),
      ...RESTRICTED_IMPORTS_FIELDS,
    })
  ),
})

/**
 * A config object in a loaded Oxlint config: the config itself or an entry of its `extends`.
 */
interface ConfigObject {
  readonly [IDENTITY_KEY]?: typeof PresetIdentity.Type | RulesFolderIdentity
  readonly extends?: readonly ConfigObject[]
  readonly overrides?: ReadonlyArray<typeof OverrideObject.Type>
}

const CONFIG_OBJECT_FIELDS = {
  [IDENTITY_KEY]: Schema.optional(Schema.Union([RulesFolderIdentity, PresetIdentity])),
  extends: Schema.optional(
    Schema.Array(Schema.suspend((): Schema.Codec<ConfigObject> => ConfigObject))
  ),
  overrides: Schema.optional(Schema.Array(OverrideObject)),
}

const ConfigObject: Schema.Codec<ConfigObject> = Schema.Struct(CONFIG_OBJECT_FIELDS)

/**
 * What Adamantite reads from a loaded Oxlint config: the presets and the rules folders that it
 * reaches through `extends`, and its `options`.
 */
export const LintConfig = Schema.Struct({
  ...CONFIG_OBJECT_FIELDS,
  options: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})

export type LintConfig = typeof LintConfig.Type

/**
 * The config objects that make up `config`, in the order that Oxlint applies them: the `extends` of
 * an object, in order, come before the object.
 */
function listConfigObjects(config: ConfigObject): readonly ConfigObject[] {
  return [...(config.extends ?? []).flatMap((entry) => listConfigObjects(entry)), config]
}

/**
 * The modules of the Adamantite presets that `config` applies, such as `adamantite/lint/strict`, in
 * the order that Oxlint applies them. A preset that a config spreads into its own object counts at
 * the place of that object.
 */
export function listPresetModules(config: LintConfig): readonly string[] {
  return listConfigObjects(config).flatMap((entry) => entry[IDENTITY_KEY]?.module ?? [])
}

/**
 * The modules of the Adamantite presets that `config` applies anywhere: through `extends`, as
 * `listPresetModules` lists them, or in an entry of `overrides`, which applies the preset only to
 * the files of the entry.
 */
export function listAppliedPresetModules(config: LintConfig): readonly string[] {
  const scoped = listConfigObjects(config).flatMap(({ overrides = [] }) =>
    overrides.flatMap((override) =>
      [override[IDENTITY_KEY], override.rules?.[IDENTITY_KEY]].flatMap(
        (identity) => identity?.module ?? []
      )
    )
  )

  return [...listPresetModules(config), ...scoped]
}

/**
 * A `no-restricted-imports` setting that turns the rule on: a severity other than off, then the
 * options.
 */
const RestrictedImports = Schema.TupleWithRest(
  Schema.Tuple([Schema.Literals(["deny", "error", "warn", 1, 2])]),
  [Schema.Unknown]
)

/**
 * An option of `no-restricted-imports` that bans imports by pattern.
 */
const PatternsOption = Schema.Struct({ patterns: Schema.NonEmptyArray(Schema.Unknown) })

const isRestrictedImports = Schema.is(RestrictedImports)

const isPatternsOption = Schema.is(PatternsOption)

/**
 * The number of `overrides` entries in the project's own config objects that turn on
 * `no-restricted-imports` with `patterns`, as a hand-written layer map does. An object that holds
 * an Adamantite identity, such as a preset, is not the project's own.
 */
export function countPatternOverrides(config: LintConfig): number {
  return listConfigObjects(config)
    .filter((entry) => entry[IDENTITY_KEY] === undefined)
    .flatMap(({ overrides = [] }) => overrides)
    .filter(({ rules }) =>
      Struct.keys(RESTRICTED_IMPORTS_FIELDS).some((name) => {
        const setting = rules?.[name]

        return (
          isRestrictedImports(setting)
          && setting.slice(1).some((option) => isPatternsOption(option))
        )
      })
    ).length
}

/**
 * The `custom()` results that `config` applies.
 */
export function listRulesFolders(config: LintConfig): readonly RulesFolderIdentity[] {
  return listConfigObjects(config).flatMap((entry) => {
    const identity = entry[IDENTITY_KEY]

    return identity !== undefined && "dir" in identity ? [identity] : []
  })
}

/**
 * The Oxlint config at `file`, loaded in `cwd` and decoded, or none when it does not exist.
 */
export function readLintConfig(cwd: string, file: string) {
  return readConfig(cwd, file, LintConfig)
}
