import * as Schema from "effect/Schema"
import {
  IDENTITY_KEY,
  PresetIdentity,
  readConfig,
  RulesFolderIdentity,
} from "#lib/project/config-loader.ts"

/**
 * A config object in a loaded Oxlint config: the config itself or an entry of its `extends`.
 */
interface ConfigObject {
  readonly [IDENTITY_KEY]?: typeof PresetIdentity.Type | RulesFolderIdentity
  readonly extends?: readonly ConfigObject[]
}

const CONFIG_OBJECT_FIELDS = {
  [IDENTITY_KEY]: Schema.optional(Schema.Union([RulesFolderIdentity, PresetIdentity])),
  extends: Schema.optional(
    Schema.Array(Schema.suspend((): Schema.Codec<ConfigObject> => ConfigObject))
  ),
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
 * The `custom()` results that `config` applies.
 */
export function listRulesFolders(config: LintConfig): readonly RulesFolderIdentity[] {
  return listConfigObjects(config).flatMap((entry) => {
    const identity = entry[IDENTITY_KEY]

    return identity !== undefined && "dir" in identity ? [identity] : []
  })
}

/**
 * The Oxlint config at `file`, loaded and decoded, or none when it does not exist.
 */
export function readLintConfig(file: string) {
  return readConfig(file, LintConfig)
}
