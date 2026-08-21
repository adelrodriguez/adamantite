import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { defineConfigTooling } from "#lib/workspace/tooling/config.ts"
import { inspectRequiredKnipConfig, toKnipTsConfigContent } from "#lib/workspace/tooling/knip.ts"

export default defineConfigTooling({
  configContent: () => toKnipTsConfigContent(),
  configFiles: {
    config: "knip.config.ts",
    legacyConfigs: ["knip.json", "knip.jsonc"],
  },
  inspectConfig: inspectRequiredKnipConfig,
  name: "knip",
  purpose: "the managed `analyze` script",
  scripts: ["analyze"],
  version: getDependencyVersion("knip"),
})
