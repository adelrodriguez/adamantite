import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { defineConfigTooling } from "#lib/workspace/tooling/config.ts"
import { inspectRequiredOxfmtConfig, toOxfmtTsConfigContent } from "#lib/workspace/tooling/oxfmt.ts"

export default defineConfigTooling({
  configContent: () => toOxfmtTsConfigContent(),
  configFiles: {
    config: "oxfmt.config.ts",
    legacyConfigs: [".oxfmtrc.json", ".oxfmtrc.jsonc"],
  },
  inspectConfig: inspectRequiredOxfmtConfig,
  name: "oxfmt",
  purpose: "the managed `check` and `fix` scripts",
  scripts: ["check", "fix"],
  version: getDependencyVersion("oxfmt"),
})
