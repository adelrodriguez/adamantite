import * as Schema from "effect/Schema"
import type { RequiredConfigInspection } from "#lib/integrations/tooling/base.ts"
import { getConfigTemplate } from "#lib/integrations/oxfmt/config.macro.ts" with { type: "macro" }
import { IDENTITY_KEY, PresetIdentity } from "#lib/project/config-loader.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const configTemplate = getConfigTemplate()

const FORMAT_PRESET_MODULE = publicImport("./format")

export const OxfmtConfig = Schema.Struct({ [IDENTITY_KEY]: Schema.optional(PresetIdentity) })

export function inspectRequiredOxfmtConfig(
  config: typeof OxfmtConfig.Type
): RequiredConfigInspection {
  return config[IDENTITY_KEY]?.module === FORMAT_PRESET_MODULE
    ? { kind: "configured" }
    : {
        goal: `Export the Adamantite format preset from \`${FORMAT_PRESET_MODULE}\`, alone or spread into the config object. Preserve every project-specific setting.`,
        kind: "invalid",
        reason: `The exported config does not apply the Adamantite format preset from \`${FORMAT_PRESET_MODULE}\`.`,
      }
}

export function toOxfmtTsConfigContent() {
  return configTemplate
}
