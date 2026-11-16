import * as Schema from "effect/Schema"
import {
  IDENTITY_KEY,
  PresetIdentity,
  readConfig,
  RulesFolderIdentity,
} from "#lib/project/config-loader.ts"

/**
 * An entry of `overrides` in a loaded Oxlint config. An entry that spreads a preset names the
 * preset itself, and an entry that spreads the `rules` of a preset, as the documentation comment of
 * the jest and vitest presets shows, names it in `rules`. The setting of each rule stays unknown,
 * so a setting that Adamantite does not read never fails the decode of a config that Oxlint loads.
 */
const OverrideObject = Schema.Struct({
  [IDENTITY_KEY]: Schema.optional(PresetIdentity),
  rules: Schema.optional(
    Schema.StructWithRest(Schema.Struct({ [IDENTITY_KEY]: Schema.optional(PresetIdentity) }), [
      Schema.Record(Schema.String, Schema.Unknown),
    ])
  ),
})

export type OverrideObject = typeof OverrideObject.Type

/**
 * A config object in a loaded Oxlint config: the config itself or an entry of its `extends`.
 */
interface ConfigObject {
  readonly [IDENTITY_KEY]?: typeof PresetIdentity.Type | RulesFolderIdentity
  readonly extends?: readonly ConfigObject[]
  readonly jsPlugins?: readonly unknown[]
  readonly overrides?: readonly OverrideObject[]
}

const CONFIG_OBJECT_FIELDS = {
  [IDENTITY_KEY]: Schema.optional(Schema.Union([RulesFolderIdentity, PresetIdentity])),
  extends: Schema.optional(
    Schema.Array(Schema.suspend((): Schema.Codec<ConfigObject> => ConfigObject))
  ),
  // Oxlint checks the shape of each entry, so Adamantite reads only the name of a plugin.
  jsPlugins: Schema.optional(Schema.Array(Schema.Unknown)),
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
 * The `overrides` entries of the config objects that the project writes, in the order that Oxlint
 * applies them. An object that holds an Adamantite identity, such as a preset, is not the project's
 * own.
 */
export function listProjectOverrides(config: LintConfig): readonly OverrideObject[] {
  return listConfigObjects(config)
    .filter((entry) => entry[IDENTITY_KEY] === undefined)
    .flatMap(({ overrides = [] }) => overrides)
}

const isNamedPlugin = Schema.is(Schema.Struct({ name: Schema.String }))

/**
 * The names of the `jsPlugins` entries that `config` loads through any config object, such as
 * `adamantite` for the first-party plugin that a preset loads.
 */
export function listJsPluginNames(config: LintConfig): readonly string[] {
  return listConfigObjects(config).flatMap(({ jsPlugins = [] }) =>
    jsPlugins.flatMap((entry) => (isNamedPlugin(entry) ? [entry.name] : []))
  )
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
