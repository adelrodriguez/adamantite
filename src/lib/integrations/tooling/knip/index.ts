import { defineConfigTooling } from "#lib/integrations/tooling/base.ts"
import {
  detectKnipWorkspace,
  inspectRequiredKnipConfig,
  toKnipTsConfigContent,
} from "#lib/integrations/tooling/knip/config.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

export default defineConfigTooling({
  configContent: toKnipTsConfigContent,
  configFiles: {
    config: "knip.config.ts",
    legacyConfigs: ["knip.json", "knip.jsonc"],
  },
  detectWorkspace: detectKnipWorkspace,
  inspectConfig: inspectRequiredKnipConfig,
  name: "knip",
  purpose: "the managed `analyze` script",
  scripts: ["analyze"],
  version: getDependencyVersion("knip"),
})
