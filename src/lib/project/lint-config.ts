import * as Schema from "effect/Schema"
import {
  IDENTITY_KEY,
  PresetIdentity,
  readConfig,
  RulesFolderIdentity,
} from "#lib/project/config-loader.ts"

const OverrideObject = Schema.Struct({
  [IDENTITY_KEY]: Schema.optional(PresetIdentity),
  rules: Schema.optional(
    Schema.StructWithRest(Schema.Struct({ [IDENTITY_KEY]: Schema.optional(PresetIdentity) }), [
      Schema.Record(Schema.String, Schema.Unknown),
    ])
  ),
})

export type OverrideObject = typeof OverrideObject.Type

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

export const LintConfig = Schema.Struct({
  ...CONFIG_OBJECT_FIELDS,
  options: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})

export type LintConfig = typeof LintConfig.Type

/**
 * Oxlint applies the `extends` of an object, in order, before the object.
 */
function listConfigObjects(config: ConfigObject): readonly ConfigObject[] {
  return [...(config.extends ?? []).flatMap((entry) => listConfigObjects(entry)), config]
}

export function listPresetModules(config: LintConfig): readonly string[] {
  return listConfigObjects(config).flatMap((entry) => entry[IDENTITY_KEY]?.module ?? [])
}

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

export function listOverrides(config: LintConfig): readonly OverrideObject[] {
  return listConfigObjects(config).flatMap(({ overrides = [] }) => overrides)
}

const isNamedPlugin = Schema.is(Schema.Struct({ name: Schema.String }))

export function listJsPluginNames(config: LintConfig): readonly string[] {
  return listConfigObjects(config).flatMap(({ jsPlugins = [] }) =>
    jsPlugins.flatMap((entry) => (isNamedPlugin(entry) ? [entry.name] : []))
  )
}

export function listRulesFolders(config: LintConfig): readonly RulesFolderIdentity[] {
  return listConfigObjects(config).flatMap((entry) => {
    const identity = entry[IDENTITY_KEY]

    return identity !== undefined && "dir" in identity ? [identity] : []
  })
}

export function readLintConfig(cwd: string, file: string) {
  return readConfig(cwd, file, LintConfig)
}
